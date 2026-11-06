const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { AppError } = require('./errors');

// Header bảo mật và Content Security Policy.
// Giao diện dùng Tailwind Play CDN: script tải từ CDN và tự chèn thẻ <style> lúc chạy,
// nên phải cho phép domain này ở script-src và 'unsafe-inline' ở style-src.
function helmetMiddleware() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://cdn.tailwindcss.com'],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                // Server chạy HTTP (localhost/LAN): bật directive này thì trình duyệt ép request sang HTTPS và hỏng
                upgradeInsecureRequests: null,
            },
        },
    });
}

// Danh sách rỗng: không gửi Access-Control-Allow-Origin, trang ở origin khác không đọc được phản hồi.
// API chỉ có GET và POST nên chỉ khai báo hai phương thức này cho preflight.
function corsMiddleware(origins = config.corsOrigins) {
    return cors({ origin: origins.length > 0 ? origins : false, methods: ['GET', 'POST'] });
}

// Vượt giới hạn: chuyển AppError 429 sang middleware lỗi, để phản hồi cùng định dạng JSON với mọi lỗi khác
function limiter(limit, windowMs, message) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_REQUESTS', message)),
    });
}

// Mỗi app có bộ đếm riêng, lưu trong RAM của tiến trình
function createLimiters() {
    return {
        // Upload tốn CPU (LibreOffice) nên giới hạn chặt; đặt trước Multer nên request bị chặn chưa ghi file nào
        upload: limiter(config.uploadRateLimit, 15 * 60 * 1000, 'Bạn đã tải lên quá nhiều lần, vui lòng thử lại sau.'),
        // Giao diện hỏi /status mỗi 2 giây, tức 30 lần/phút
        api: limiter(config.apiRateLimit, 60 * 1000, 'Quá nhiều request, vui lòng thử lại sau.'),
    };
}

module.exports = { helmetMiddleware, corsMiddleware, createLimiters };
