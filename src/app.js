const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const express = require('express');
const multer = require('multer');
const { AppError } = require('./errors');
const { createRouter } = require('./routes');

// Gắn mã truy vết cho mỗi request và ghi một dòng log JSON khi trả lời (kèm thời gian xử lý)
function requestLogger(req, res, next) {
    req.traceId = randomUUID().slice(0, 8);
    res.setHeader('X-Trace-Id', req.traceId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(JSON.stringify({
            time: new Date().toISOString(), traceId: req.traceId, method: req.method,
            url: req.originalUrl, status: res.statusCode, ms: Number(ms.toFixed(1)),
        }));
    });
    next();
}

const MULTER_ERRORS = {
    LIMIT_FILE_SIZE: [413, 'FILE_TOO_LARGE', 'File vượt quá dung lượng cho phép.'],
    LIMIT_FILE_COUNT: [400, 'TOO_MANY_FILES', 'Vượt quá số file cho phép trong một lần gửi.'],
    LIMIT_UNEXPECTED_FILE: [400, 'UNEXPECTED_FIELD', 'Sai tên trường file (phải là excelFiles) hoặc quá số file.'],
};
const REDIS_UNAVAILABLE = /enableOfflineQueue|Connection is closed|ECONNREFUSED|OOM command not allowed|READONLY/;
// Khi cả giao dịch MULTI bị hủy (EXECABORT), lỗi gốc của Redis nằm trong err.previousErrors
const isQueueUnavailable = (err) => [err, ...(err.previousErrors || [])].some((e) => REDIS_UNAVAILABLE.test(e.message));

// Middleware lỗi (4 tham số), đặt cuối chuỗi: mọi lỗi đồng bộ, next(err) và Promise bị reject đều tới đây
async function errorHandler(err, req, res, next) {
    // Request bị từ chối thì xóa các file đã nhận (khi Multer tự báo lỗi, nó đã tự xóa)
    if (req.files?.length) await Promise.all(req.files.map((f) => fs.rm(f.path, { force: true })));

    let [status, code, message, details] = [500, 'INTERNAL_ERROR', 'Lỗi máy chủ.', undefined];
    if (err instanceof AppError) [status, code, message, details] = [err.status, err.code, err.message, err.details];
    else if (err instanceof multer.MulterError) [status, code, message] = MULTER_ERRORS[err.code] || [400, err.code, err.message];
    else if (isQueueUnavailable(err)) [status, code, message] = [503, 'QUEUE_UNAVAILABLE', 'Hàng đợi tạm thời không dùng được, vui lòng thử lại sau.'];
    else if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'INVALID_JSON', 'Body JSON không hợp lệ.'];

    if (status >= 500) console.error(JSON.stringify({ traceId: req.traceId, level: 'error', code, error: err.stack }));
    if (res.headersSent) return next(err);
    res.status(status).json({ status: 'error', code, message, details, traceId: req.traceId });
}

function createApp(service) {
    const app = express();
    app.use(requestLogger);                                         // 1. mã truy vết + log độ trễ
    app.use(express.static(path.join(__dirname, '..', 'public'))); // 2. giao diện
    app.use(express.json());                                        // 3. body JSON
    app.use(createRouter(service));                                 // 4. các route nghiệp vụ
    app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', `Không có đường dẫn ${req.method} ${req.path}`))); // 5. 404
    app.use(errorHandler);                                          // 6. middleware lỗi
    return app;
}

module.exports = { createApp };
