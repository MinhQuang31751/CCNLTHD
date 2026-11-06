const express = require('express');
const app = express();

/**
 * ==========================================
 * PHẦN 1: PHÂN LOẠI LỖI (Custom Error Class)
 * ==========================================
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);

        this.statusCode = statusCode;
        // Tự động phân loại status dựa trên statusCode (4xx: fail, 5xx: error)
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        // Đánh dấu đây là lỗi vận hành (lỗi do môi trường/người dùng)
        this.isOperational = true;

        // Ghi lại vết lỗi (stack trace) nhưng bỏ qua hàm constructor này
        Error.captureStackTrace(this, this.constructor);
    }
}

// // Thử tạo một lỗi 404 (Không tìm thấy)
// const testError = new AppError('Trang này không tồn tại!', 404);

// console.log('--- DEMO PHẦN 1 ---');
// console.log('Thông báo:', testError.message);    // Trang này không tồn tại!
// console.log('Mã số:', testError.statusCode);   // 404
// console.log('Trạng thái:', testError.status);   // fail (Tự động tính từ mã 404)
// console.log('Là lỗi vận hành?:', testError.isOperational); // true
// console.log('-------------------');


/**
 * ==========================================
 * PHẦN 2: BỘ BỌC HÀM BẤT ĐỒNG BỘ (asyncHandler)
 * ==========================================
 * Giúp tự động bắt lỗi từ các hàm async mà không cần try-catch
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next); // Tự động chuyển lỗi vào global error middleware
    };
};

/**
 * ==========================================
 * PHẦN 3: MIDDLEWARE XỬ LÝ LỖI TẬP TRUNG
 * ==========================================
 */
const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // 1. Nếu là lỗi vận hành (isOperational: true)
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }

    // 2. Nếu là lỗi lập trình (Bug code)
    // - Ghi log chi tiết ra console cho dev
    console.error('ERROR:', err);

    // - Trả về thông báo chung chung, an toàn cho khách hàng
    return res.status(500).json({
        status: 'error',
        message: 'Đã có sự cố xảy ra, vui lòng thử lại sau.'
    });
};

/**
 * ==========================================
 * SETUP EXPRESS & TEST ROUTES
 * ==========================================
 */

// Route 1: Giả lập lỗi 400 (Dùng asyncHandler)
app.get('/convert', asyncHandler(async (req, res, next) => {
    const hasFile = false; // Giả sử không có file gửi lên
    
    if (!hasFile) {
        return next(new AppError('Vui lòng đính kèm file PDF để thực hiện chuyển đổi!', 400));
    }

    res.status(200).json({ status: 'success', message: 'File is being processed' });
}));

// Route 2: Giả lập lỗi 500 (Bug code - Uncaught reference)
app.get('/bug', (req, res) => {
    // Gọi một biến chưa bao giờ được khai báo
    console.log(undefinedVariable); 
});

// Route 3: Giả lập lỗi 404 (Không tìm thấy trang)
// TRONG EXPRESS 5, sử dụng '*path' thay vì '*' để bắt toàn bộ path
app.all('*path', (req, res, next) => {
    next(new AppError(`Không tìm thấy đường dẫn ${req.originalUrl} trên máy chủ này!`, 404));
});

// GẮN MIDDLEWARE XỬ LÝ LỖI Ở CUỐI CÙNG
app.use(globalErrorHandler);


/**
 * ==========================================
 * PHẦN 4: GLOBAL EVENTS (Xử lý lỗi ngoài tầm kiểm soát)
 * ==========================================
 */

// 1. Bắt các Promise bị reject mà quên dùng .catch()
process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! 💥 Đang đóng ứng dụng...');
    console.log(err.name, err.message);
    process.exit(1);
});

// 2. Bắt các lỗi đồng bộ nghiêm trọng làm treo máy chủ
process.on('uncaughtException', (err) => {
    console.log('UNCAUGHT EXCEPTION! 💥 Đang đóng ứng dụng...');
    console.log(err.name, err.message);
    process.exit(1);
});

// Chạy Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

/**
 * ==========================================
 * 🧪 KHU VỰC DEMO PHẦN 4 (GIẢ LẬP LỖI NGHIÊM TRỌNG)
 * ==========================================
 * Hướng dẫn: Xóa dấu '//' ở đầu mỗi dòng bên dưới để thử nghiệm.
 */

// 1. Thử UNCAUGHT EXCEPTION: Bỏ dấu // ở dòng ngay dưới này
// console.log(bienNayChuaKhaiBaoNha); 

// 2. Thử UNHANDLED REJECTION: Bỏ dấu // ở dòng ngay dưới này
Promise.reject(new Error('Lỗi Promise bị bỏ rơi ngoài đảo hoang!'));

