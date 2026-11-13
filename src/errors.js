// Lỗi nghiệp vụ có mã HTTP và mã lỗi để middleware lỗi trả JSON thống nhất
// Cách dùng: throw new AppError(404, 'REQUEST_NOT_FOUND', 'Request không tồn tại hoặc đã hết hạn.')
// Middleware lỗi (errorHandler trong src/app.js) nhận ra lỗi này bằng "err instanceof AppError"
// rồi trả đúng status, code, message, details cho client.
class AppError extends Error {
    // status : mã HTTP trả về (400, 404, 409, 410, 413, 429, 503...)
    // code   : mã lỗi dạng chữ để client phân biệt các lỗi (VD: 'NO_FILES', 'INVALID_REQUEST_ID')
    // message: câu thông báo cho người dùng đọc
    // details: thông tin thêm, không bắt buộc (VD: danh sách tên file bị sai)
    constructor(status, code, message, details) {
        // Gọi constructor của Error: gán this.message và tạo this.stack (vết các hàm đã gọi)
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

// Các file khác dùng bằng: const { AppError } = require('./errors')
module.exports = { AppError };
