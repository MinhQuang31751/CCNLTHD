// Cấu hình đọc từ biến môi trường, có giá trị mặc định (xem .env.example)
const path = require('path');

const ROOT = path.join(__dirname, '..');
const num = (name, def) => Number(process.env[name] || def);

module.exports = {
    port: num('PORT', 3000),
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: num('REDIS_PORT', 6379),
    },
    uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
    outputDir: path.resolve(ROOT, process.env.OUTPUT_DIR || 'output'),
    maxFiles: num('MAX_FILES', 50),
    maxFileBytes: num('MAX_FILE_MB', 20) * 1024 * 1024,
    resultTtlSeconds: num('RESULT_TTL_SECONDS', 3600),     // giữ kết quả 1 giờ
    sweepIntervalSeconds: num('SWEEP_INTERVAL_SECONDS', 600),
    convertTimeoutMs: num('CONVERT_TIMEOUT_SECONDS', 120) * 1000,
    workerConcurrency: num('WORKER_CONCURRENCY', 4),
    convertQueue: 'excel-convert',  // job con: mỗi file một job
    zipQueue: 'excel-zip',          // job cha: mỗi request một job, id = requestId
};
