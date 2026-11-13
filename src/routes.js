const express = require('express');
// zod: thư viện kiểm tra dữ liệu đầu vào theo một "schema" (khuôn mẫu) khai báo trước
const { z } = require('zod');
const { AppError } = require('./errors');
const { uploadExcel, checkUploadedFiles } = require('./upload');
const { createLimiters } = require('./security');

// Schema cho tham số đường dẫn: requestId phải là UUID
const idParams = z.object({ requestId: z.uuid() });

// Middleware kiểm tra req.params theo một schema zod, dùng lại được cho nhiều route.
// Đây là hàm trả về middleware: validateParams(idParams) cho ra (req, res, next) => { ... }
const validateParams = (schema) => (req, res, next) => {
    // safeParse không ném lỗi mà trả về { success: true, data } hoặc { success: false, error }
    const result = schema.safeParse(req.params);
    if (!result.success) {
        // Sai định dạng -> 400; details là danh sách lý do sai do zod đưa ra
        throw new AppError(400, 'INVALID_REQUEST_ID', 'requestId không hợp lệ.', result.error.issues.map((i) => i.message));
    }
    // Hợp lệ: chuyển sang middleware hoặc handler kế tiếp
    next();
};

// Handler mỏng: đọc input, gọi service, trả JSON. Lỗi (kể cả Promise bị reject) tự đi tới middleware lỗi.
// service được truyền từ ngoài vào (app.js): khi test có thể truyền service giả, không cần Redis
function createRouter(service) {
    const router = express.Router();
    // Bộ giới hạn tần suất theo IP (xem security.js): limit.upload cho /upload, limit.api cho /status và /download
    const limit = createLimiters();

    // Giới hạn tần suất đứng trước Multer: request bị chặn không ghi file nào xuống đĩa
    // POST /upload: các middleware chạy lần lượt từ trái sang phải:
    //   limit.upload -> uploadExcel (Multer nhận file) -> checkUploadedFiles (kiểm tra nội dung) -> handler
    // Thành công trả 202 Accepted: server đã nhận, việc chuyển đổi chạy nền ở worker
    router.post('/upload', limit.upload, uploadExcel, checkUploadedFiles, async (req, res) => {
        // Tạo các job trong Redis; nhận lại requestId để client dùng khi hỏi tiến độ
        const { requestId, total } = await service.createRequest(req.files);
        res.status(202).json({ status: 'queued', requestId, total, statusUrl: `/status/${requestId}` });
    });

    // GET /status/:requestId: ":requestId" là tham số đường dẫn, đọc bằng req.params.requestId
    // Trả 200 kèm tiến độ: processing (done, failed, percent), done (zipUrl) hoặc error
    router.get('/status/:requestId', limit.api, validateParams(idParams), async (req, res) => {
        res.json(await service.getStatus(req.params.requestId));
    });

    // GET /download/:requestId: tải file ZIP kết quả.
    // Không có request -> 404, chưa xong -> 409, file đã hết hạn -> 410 (các lỗi này do service ném ra)
    router.get('/download/:requestId', limit.api, validateParams(idParams), async (req, res) => {
        const { zipPath, downloadName } = await service.getZipFile(req.params.requestId);
        // res.download gửi file và đặt header để trình duyệt lưu file với tên downloadName
        res.download(zipPath, downloadName); // không xóa sau khi tải: tải lại được tới khi hết hạn
    });

    return router;
}

module.exports = { createRouter };
