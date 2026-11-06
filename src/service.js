const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { FlowProducer, Queue } = require('bullmq');
const config = require('./config');
const { AppError } = require('./errors');
const { decodeOriginalName, uniquePdfNames } = require('./filename');

// Tầng nghiệp vụ: tạo request chuyển đổi, đọc tiến độ, tìm file ZIP.
// Toàn bộ trạng thái nằm trong Redis (qua BullMQ), API không giữ gì trong RAM.
function createConversionService() {
    // enableOfflineQueue: false -> khi mất Redis, lệnh báo lỗi ngay thay vì treo request
    const connection = { ...config.redis, enableOfflineQueue: false };
    const flow = new FlowProducer({ connection });
    const zipQueue = new Queue(config.zipQueue, { connection });
    const logRedisError = (err) => console.error(`[REDIS] ${err.message}`);
    flow.on('error', logRedisError);
    zipQueue.on('error', logRedisError);

    // Một request = 1 job cha "zip" + N job con "convert", ghi vào Redis trong MỘT lệnh MULTI
    async function createRequest(files) {
        const requestId = randomUUID();
        const names = files.map((f) => decodeOriginalName(f.originalname));
        const pdfNames = uniquePdfNames(names);
        const outputDir = path.join(config.outputDir, requestId);
        const keep = { age: config.resultTtlSeconds };

        await flow.add({
            name: 'zip',
            queueName: config.zipQueue,
            data: { requestId, total: files.length, names, inputs: files.map((f) => f.path), outputDir },
            opts: { jobId: requestId, attempts: 2, removeOnComplete: keep, removeOnFail: keep },
            children: files.map((f, i) => ({
                name: 'convert',
                queueName: config.convertQueue,
                data: { requestId, originalName: names[i], inputFile: f.path, outputFile: path.join(outputDir, pdfNames[i]) },
                opts: {
                    jobId: `${requestId}-${i}`,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    ignoreDependencyOnFailure: true, // file lỗi không chặn job cha
                    removeOnComplete: keep,
                    removeOnFail: keep,
                },
            })),
        });
        return { requestId, total: files.length };
    }

    // Đọc trạng thái job cha: 3 lệnh Redis, không phụ thuộc số file
    async function getStatus(requestId) {
        const job = await zipQueue.getJob(requestId);
        if (!job) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Request không tồn tại hoặc đã hết hạn.');

        const state = await job.getState();
        const { total } = job.data;
        if (state === 'completed') {
            const { done, failed, failedFiles } = job.returnvalue;
            return { status: 'done', requestId, total, done, failed, failedFiles, zipUrl: `/download/${requestId}` };
        }
        if (state === 'failed') {
            return { status: 'error', requestId, total, message: 'Không tạo được file ZIP.' };
        }
        const count = await job.getDependenciesCount({ processed: true, ignored: true });
        const done = count.processed || 0;
        const failed = count.ignored || 0;
        return { status: 'processing', requestId, total, done, failed, percent: Math.round(((done + failed) / total) * 100) };
    }

    async function getZipFile(requestId) {
        const status = await getStatus(requestId);
        if (status.status !== 'done') throw new AppError(409, 'NOT_READY', 'Kết quả chưa sẵn sàng.');
        const zipPath = path.join(config.outputDir, `${requestId}.zip`); // đường dẫn do server tự tạo
        try {
            await fs.access(zipPath);
        } catch {
            throw new AppError(410, 'EXPIRED', 'File kết quả đã hết hạn và bị xóa.');
        }
        return { zipPath, downloadName: `Ket_Qua_Convert_${requestId.slice(0, 8)}.zip` };
    }

    const ready = () => Promise.all([flow.waitUntilReady(), zipQueue.waitUntilReady()]);
    const close = () => Promise.all([flow.close(), zipQueue.close()]);

    return { createRequest, getStatus, getZipFile, ready, close };
}

module.exports = { createConversionService };
