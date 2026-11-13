// Cấu hình đọc từ biến môi trường, có giá trị mặc định (xem .env.example)
// Các file khác lấy cấu hình bằng: const config = require('./config')
// Biến môi trường được đặt lúc chạy, VD: node --env-file=.env server.js, hoặc trong docker-compose.yml
const path = require('path');

// ROOT: thư mục gốc của dự án (thư mục cha của src/), dùng để tính đường dẫn uploads/ và output/
const ROOT = path.join(__dirname, '..');
// num: đọc biến môi trường dạng số; chưa đặt hoặc để rỗng thì dùng giá trị mặc định def
// VD: num('PORT', 3000) trả về 3000 khi không có biến PORT
const num = (name, def) => Number(process.env[name] || def);
// list: đọc biến môi trường dạng danh sách cách nhau bằng dấu phẩy, bỏ khoảng trắng và phần tử rỗng
// VD: CORS_ORIGINS="http://a.com, http://b.com" -> ['http://a.com', 'http://b.com']; không đặt -> []
const list = (name) => (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
// TRUST_PROXY: để trống là không tin proxy; "1" là tin một proxy đứng trước; giá trị khác truyền nguyên cho Express
const trustProxy = (v) => (!v ? false : /^\d+$/.test(v) ? Number(v) : v);

// Cấu hình dùng chung cho API (server.js) và worker (worker-service.js)
module.exports = {
    // Cổng HTTP của API
    port: num('PORT', 3000),
    // Địa chỉ Redis: nơi BullMQ lưu hàng đợi job và trạng thái của từng request
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: num('REDIS_PORT', 6379),
    },
    redisCommandTimeoutMs: num('REDIS_COMMAND_TIMEOUT_MS', 5000), // phía API: Redis không trả lời sau 5 s thì trả 503
    // Thư mục lưu file Excel nhận được (uploads) và file PDF, ZIP kết quả (output); luôn là đường dẫn tuyệt đối
    uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
    outputDir: path.resolve(ROOT, process.env.OUTPUT_DIR || 'output'),
    // Giới hạn upload: tối đa 50 file một lần, mỗi file tối đa 20 MB (nhân 1024 * 1024 để đổi MB sang byte)
    maxFiles: num('MAX_FILES', 50),
    maxFileBytes: num('MAX_FILE_MB', 20) * 1024 * 1024,
    resultTtlSeconds: num('RESULT_TTL_SECONDS', 3600),     // giữ kết quả 1 giờ
    // Worker quét và xóa file quá hạn mỗi 600 giây (10 phút)
    sweepIntervalSeconds: num('SWEEP_INTERVAL_SECONDS', 600),
    // LibreOffice chuyển một file quá 120 giây thì bị dừng; job đó lỗi và được thử lại (đổi giây sang mili giây)
    convertTimeoutMs: num('CONVERT_TIMEOUT_SECONDS', 120) * 1000,
    // Số file một tiến trình worker chuyển đổi song song cùng lúc
    workerConcurrency: num('WORKER_CONCURRENCY', 4),
    // Tên 2 hàng đợi trong Redis
    convertQueue: 'excel-convert',  // job con: mỗi file một job
    zipQueue: 'excel-zip',          // job cha: mỗi request một job, id = requestId
    // Bảo mật (src/security.js)
    corsOrigins: list('CORS_ORIGINS'),                 // rỗng: chỉ cùng origin
    uploadRateLimit: num('UPLOAD_RATE_LIMIT', 10),     // số lần upload / 15 phút / IP
    apiRateLimit: num('API_RATE_LIMIT', 120),          // số request /status, /download / phút / IP
    // Có tin header X-Forwarded-For của proxy hay không, để req.ip là IP thật khi giới hạn tần suất theo IP
    trustProxy: trustProxy(process.env.TRUST_PROXY),
};
