// helmet: thêm các header bảo mật; cors: kiểm soát trang ở domain khác có gọi API được không;
// express-rate-limit: giới hạn số request mỗi IP trong một khoảng thời gian
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
                // Mặc định chỉ cho tải tài nguyên từ chính server này ('self')
                defaultSrc: ["'self'"],
                // Script: chỉ từ server này và Tailwind CDN; script viết thẳng trong HTML và onclick="..." bị chặn
                scriptSrc: ["'self'", 'https://cdn.tailwindcss.com'],
                // CSS: từ server này và thẻ <style> viết thẳng trong trang (Tailwind tự chèn)
                styleSrc: ["'self'", "'unsafe-inline'"],
                // Ảnh: từ server này và ảnh nhúng dạng data: (base64)
                imgSrc: ["'self'", 'data:'],
                // fetch() chỉ được gọi tới chính server này (/upload, /status, /download)
                connectSrc: ["'self'"],
                // Cấm thẻ <object>, <embed> (plugin)
                objectSrc: ["'none'"],
                // Cấm trang khác nhúng trang này trong <iframe> (chống clickjacking)
                frameAncestors: ["'none'"],
                // Server chạy HTTP (localhost/LAN): bật directive này thì trình duyệt ép request sang HTTPS và hỏng
                upgradeInsecureRequests: null,
            },
        },
    });
}

// Danh sách rỗng: không gửi Access-Control-Allow-Origin, trang ở origin khác không đọc được phản hồi.
// API chỉ có GET và POST nên chỉ khai báo hai phương thức này cho preflight.
// origins mặc định lấy từ config; test truyền danh sách khác để kiểm tra
function corsMiddleware(origins = config.corsOrigins) {
    // origin: false nghĩa là tắt CORS hoàn toàn
    return cors({ origin: origins.length > 0 ? origins : false, methods: ['GET', 'POST'] });
}

// Vượt giới hạn: chuyển AppError 429 sang middleware lỗi, để phản hồi cùng định dạng JSON với mọi lỗi khác
// Tạo một bộ giới hạn: mỗi IP được tối đa "limit" request trong khoảng "windowMs" mili giây
function limiter(limit, windowMs, message) {
    return rateLimit({
        windowMs,
        limit,
        // Gửi header RateLimit và RateLimit-Policy theo chuẩn IETF (bản nháp 8): cho client biết còn bao nhiêu lượt
        standardHeaders: 'draft-8',
        // Không gửi các header kiểu cũ X-RateLimit-*
        legacyHeaders: false,
        handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_REQUESTS', message)),
    });
}

// Mỗi app có bộ đếm riêng, lưu trong RAM của tiến trình
// (khởi động lại API thì bộ đếm về 0)
function createLimiters() {
    return {
        // Upload tốn CPU (LibreOffice) nên giới hạn chặt; đặt trước Multer nên request bị chặn chưa ghi file nào
        // 15 * 60 * 1000 mili giây = 15 phút
        upload: limiter(config.uploadRateLimit, 15 * 60 * 1000, 'Bạn đã tải lên quá nhiều lần, vui lòng thử lại sau.'),
        // Giao diện hỏi /status mỗi 2 giây, tức 30 lần/phút
        // 60 * 1000 mili giây = 1 phút
        api: limiter(config.apiRateLimit, 60 * 1000, 'Quá nhiều request, vui lòng thử lại sau.'),
    };
}

module.exports = { helmetMiddleware, corsMiddleware, createLimiters };
