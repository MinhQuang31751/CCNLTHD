const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
// BullMQ: thư viện hàng đợi job lưu trên Redis. API đưa job vào hàng đợi, worker (worker-service.js) lấy ra xử lý
const { FlowProducer, Queue } = require('bullmq');
const config = require('./config');
const { AppError } = require('./errors');
const { decodeOriginalName, uniquePdfNames } = require('./filename');

// Tầng nghiệp vụ: tạo request chuyển đổi, đọc tiến độ, tìm file ZIP.
// Toàn bộ trạng thái nằm trong Redis (qua BullMQ), API không giữ gì trong RAM.
function createConversionService() {
    // enableOfflineQueue: false -> khi mất kết nối Redis, lệnh báo lỗi ngay thay vì treo request.
    // commandTimeout -> Redis còn kết nối nhưng không trả lời (bị treo) thì lệnh lỗi sau thời hạn này.
    const connection = { ...config.redis, enableOfflineQueue: false, commandTimeout: config.redisCommandTimeoutMs };
    // FlowProducer: tạo cùng lúc một job cha và các job con; job cha chỉ chạy khi mọi job con đã kết thúc
    const flow = new FlowProducer({ connection });
    // Hàng đợi của job cha: dùng để tìm lại job theo requestId khi client hỏi /status
    const zipQueue = new Queue(config.zipQueue, { connection });
    // Lỗi kết nối Redis xảy ra ngầm: chỉ ghi log.
    // Nếu không gắn handler cho sự kiện 'error', Node coi là lỗi chưa xử lý và tắt tiến trình
    const logRedisError = (err) => console.error(`[REDIS] ${err.message}`);
    flow.on('error', logRedisError);
    zipQueue.on('error', logRedisError);

    // Một request = 1 job cha "zip" + N job con "convert", ghi vào Redis trong MỘT lệnh MULTI
    // files: mảng thông tin file Multer đã nhận (req.files)
    async function createRequest(files) {
        // Mã request ngẫu nhiên, không đoán được (UUID phiên bản 4)
        const requestId = randomUUID();
        // Tên gốc (giữ tiếng Việt) của từng file
        const names = files.map((f) => decodeOriginalName(f.originalname));
        // Tên PDF an toàn, không trùng nhau. VD: "Báo cáo.xlsx" -> "Bao_cao.pdf"
        const pdfNames = uniquePdfNames(names);
        // Mỗi request có thư mục PDF riêng: output/<requestId>/
        const outputDir = path.join(config.outputDir, requestId);
        // Job đã xong hoặc đã lỗi được giữ trong Redis tối đa resultTtlSeconds giây rồi mới bị xóa
        const keep = { age: config.resultTtlSeconds };

        await flow.add({
            // Job cha: chạy SAU CÙNG, nén các PDF thành một file ZIP (worker-service.js, phần 2)
            name: 'zip',
            queueName: config.zipQueue,
            // data: thông tin worker cần để nén ZIP và dọn file tạm
            data: { requestId, total: files.length, names, inputs: files.map((f) => f.path), outputDir },
            // jobId = requestId: tìm lại job cha bằng requestId; job cha lỗi thì thử lại thêm 1 lần
            opts: { jobId: requestId, attempts: 2, removeOnComplete: keep, removeOnFail: keep },
            // Job con: mỗi file Excel một job "convert" (worker-service.js, phần 1)
            children: files.map((f, i) => ({
                name: 'convert',
                queueName: config.convertQueue,
                data: { requestId, originalName: names[i], inputFile: f.path, outputFile: path.join(outputDir, pdfNames[i]) },
                opts: {
                    // Id job con: <requestId>-0, <requestId>-1, ...
                    jobId: `${requestId}-${i}`,
                    // Lỗi thì thử lại, tối đa 3 lần; thời gian chờ giữa các lần tăng dần: 2 s, 4 s, ...
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    ignoreDependencyOnFailure: true, // file lỗi không chặn job cha
                    removeOnComplete: keep,
                    removeOnFail: keep,
                },
            })),
        });
        // Trả về ngay, không chờ chuyển đổi xong (vì vậy route trả 202)
        return { requestId, total: files.length };
    }

    // Đọc trạng thái job cha: 3 lệnh Redis, không phụ thuộc số file
    async function getStatus(requestId) {
        const job = await zipQueue.getJob(requestId);
        // Không có job: requestId chưa từng tồn tại, hoặc đã quá hạn và bị xóa khỏi Redis
        if (!job) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Request không tồn tại hoặc đã hết hạn.');

        // Trạng thái theo BullMQ: waiting-children (chờ job con), waiting, active, completed, failed...
        const state = await job.getState();
        const { total } = job.data;
        // Job cha đã xong: đọc kết quả worker trả về (số PDF, số file lỗi, danh sách file lỗi)
        if (state === 'completed') {
            const { done, failed, failedFiles } = job.returnvalue;
            return { status: 'done', requestId, total, done, failed, failedFiles, zipUrl: `/download/${requestId}` };
        }
        // Job cha lỗi hết số lần thử: không tạo được ZIP
        if (state === 'failed') {
            return { status: 'error', requestId, total, message: 'Không tạo được file ZIP.' };
        }
        // Đang xử lý: đếm job con đã xong (processed) và job con lỗi hết lượt thử (ignored)
        const count = await job.getDependenciesCount({ processed: true, ignored: true });
        const done = count.processed || 0;
        const failed = count.ignored || 0;
        // percent: phần trăm số file đã kết thúc, tính cả thành công lẫn lỗi
        return { status: 'processing', requestId, total, done, failed, percent: Math.round(((done + failed) / total) * 100) };
    }

    // Tìm file ZIP để tải. Kiểm tra theo thứ tự: có request không (404), đã xong chưa (409), file còn không (410)
    async function getZipFile(requestId) {
        const status = await getStatus(requestId);
        if (status.status !== 'done') throw new AppError(409, 'NOT_READY', 'Kết quả chưa sẵn sàng.');
        const zipPath = path.join(config.outputDir, `${requestId}.zip`); // đường dẫn do server tự tạo
        try {
            // fs.access báo lỗi nếu file không tồn tại (đã bị worker dọn vì quá hạn)
            await fs.access(zipPath);
        } catch {
            throw new AppError(410, 'EXPIRED', 'File kết quả đã hết hạn và bị xóa.');
        }
        // Tên file khi tải về: Ket_Qua_Convert_ + 8 ký tự đầu của requestId
        return { zipPath, downloadName: `Ket_Qua_Convert_${requestId.slice(0, 8)}.zip` };
    }

    // ready: chờ kết nối Redis xong (server.js chỉ mở cổng sau bước này)
    const ready = () => Promise.all([flow.waitUntilReady(), zipQueue.waitUntilReady()]);
    // close: đóng kết nối Redis khi tắt server
    const close = () => Promise.all([flow.close(), zipQueue.close()]);

    // Các hàm mà routes.js và server.js dùng
    return { createRequest, getStatus, getZipFile, ready, close };
}

module.exports = { createConversionService };
