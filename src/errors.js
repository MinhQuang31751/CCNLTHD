// Lỗi nghiệp vụ có mã HTTP và mã lỗi để middleware lỗi trả JSON thống nhất
class AppError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

module.exports = { AppError };
