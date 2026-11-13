const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const { AppError } = require('./errors');
const { createRouter } = require('./routes');
const { helmetMiddleware, corsMiddleware } = require('./security');

// Gắn mã truy vết cho mỗi request và ghi một dòng log JSON khi trả lời (kèm thời gian xử lý)
function requestLogger(req, res, next) {
    // traceId: 8 ký tự đầu của một UUID ngẫu nhiên, đủ để tìm đúng request trong log
    req.traceId = randomUUID().slice(0, 8);
    // Gửi traceId cho client qua header, để đối chiếu với log khi người dùng báo lỗi
    res.setHeader('X-Trace-Id', req.traceId);
    // Mốc thời gian bắt đầu, độ chính xác nano giây (kiểu bigint)
    const start = process.hrtime.bigint();
    // Sự kiện 'finish' phát ra khi đã gửi xong phản hồi: lúc này mới biết mã HTTP và tổng thời gian xử lý
    res.on('finish', () => {
        // Đổi nano giây sang mili giây
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(JSON.stringify({
            time: new Date().toISOString(), traceId: req.traceId, method: req.method,
            url: req.originalUrl, status: res.statusCode, ms: Number(ms.toFixed(1)),
        }));
    });
    // Không trả lời ở đây, chuyển request cho middleware kế tiếp
    next();
}

// Bảng đổi lỗi của Multer sang [mã HTTP, mã lỗi, thông báo]
const MULTER_ERRORS = {
    // File lớn hơn MAX_FILE_MB
    LIMIT_FILE_SIZE: [413, 'FILE_TOO_LARGE', 'File vượt quá dung lượng cho phép.'],
    // Nhiều file hơn MAX_FILES
    LIMIT_FILE_COUNT: [400, 'TOO_MANY_FILES', 'Vượt quá số file cho phép trong một lần gửi.'],
    // Trường file không tên là excelFiles
    LIMIT_UNEXPECTED_FILE: [400, 'UNEXPECTED_FIELD', 'Sai tên trường file (phải là excelFiles) hoặc quá số file.'],
};
// Các thông báo lỗi cho biết Redis không dùng được:
// mất kết nối, đã đóng kết nối, không trả lời (timeout), từ chối kết nối, hết bộ nhớ, chỉ cho đọc
const REDIS_UNAVAILABLE = /enableOfflineQueue|Connection is closed|Command timed out|ECONNREFUSED|OOM command not allowed|READONLY/;
// Khi cả giao dịch MULTI bị hủy (EXECABORT), lỗi gốc của Redis nằm trong err.previousErrors
const isQueueUnavailable = (err) => [err, ...(err.previousErrors || [])].some((e) => REDIS_UNAVAILABLE.test(e.message));

// Middleware lỗi (4 tham số), đặt cuối chuỗi: mọi lỗi đồng bộ, next(err) và Promise bị reject đều tới đây
async function errorHandler(err, req, res, next) {
    // Request bị từ chối thì xóa các file đã nhận (khi Multer tự báo lỗi, nó đã tự xóa)
    if (req.files?.length) await Promise.all(req.files.map((f) => fs.rm(f.path, { force: true })));

    // Mặc định: lỗi không lường trước -> 500 INTERNAL_ERROR, không cho client biết chi tiết
    let [status, code, message, details] = [500, 'INTERNAL_ERROR', 'Lỗi máy chủ.', undefined];
    // Lỗi nghiệp vụ do code tự ném (throw new AppError): dùng nguyên status, code, message, details
    if (err instanceof AppError) [status, code, message, details] = [err.status, err.code, err.message, err.details];
    // Lỗi của Multer: tra bảng MULTER_ERRORS ở trên
    else if (err instanceof multer.MulterError) [status, code, message] = MULTER_ERRORS[err.code] || [400, err.code, err.message];
    // Redis sập hoặc treo -> 503: lỗi tạm thời, client thử lại sau
    else if (isQueueUnavailable(err)) [status, code, message] = [503, 'QUEUE_UNAVAILABLE', 'Hàng đợi tạm thời không dùng được, vui lòng thử lại sau.'];
    // Body JSON sai cú pháp hoặc lớn hơn 100 KB (do express.json báo)
    else if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'INVALID_JSON', 'Body JSON không hợp lệ.'];
    else if (err.type === 'entity.too.large') [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Body quá lớn.'];

    // Lỗi 5xx (lỗi phía server): ghi stack trace vào log của server; client không bao giờ thấy stack
    if (status >= 500) console.error(JSON.stringify({ traceId: req.traceId, level: 'error', code, error: err.stack }));
    // Đã gửi một phần phản hồi (VD lỗi khi đang gửi file): không gửi JSON được nữa, để Express đóng kết nối
    if (res.headersSent) return next(err);
    // Mọi lỗi trả cùng một dạng JSON: { status: 'error', code, message, details, traceId }
    res.status(status).json({ status: 'error', code, message, details, traceId: req.traceId });
}

// Tạo app Express. service được truyền từ ngoài vào: server.js truyền service thật, test truyền service giả.
// Thứ tự các app.use() chính là thứ tự request đi qua, nên không được đổi chỗ tùy ý.
function createApp(service) {
    const app = express();
    app.disable('x-powered-by');               // không báo "Express" trong header
    app.set('trust proxy', config.trustProxy); // sau reverse proxy: req.ip là IP thật của client

    app.use(requestLogger);                                         // 1. mã truy vết + log độ trễ
    app.use(helmetMiddleware());                                    // 2. header bảo mật, CSP
    app.use(corsMiddleware());                                      // 3. CORS
    // 4. File trong public/ (index.html, app.js) được trả thẳng, không đi qua router
    app.use(express.static(path.join(__dirname, '..', 'public'))); // 4. giao diện
    app.use(express.json({ limit: '100kb' }));                      // 5. body JSON
    app.use(createRouter(service));                                 // 6. các route nghiệp vụ (kèm giới hạn tần suất)
    // 7. Chỉ tới được đây khi không route nào ở trên khớp: tạo lỗi 404 rồi chuyển cho middleware lỗi
    app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', `Không có đường dẫn ${req.method} ${req.path}`))); // 7. 404
    // 8. Phải đứng cuối cùng để nhận lỗi từ mọi middleware và route phía trên
    app.use(errorHandler);                                          // 8. middleware lỗi
    return app;
}

module.exports = { createApp };
