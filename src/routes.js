const express = require('express');
const { z } = require('zod');
const { AppError } = require('./errors');
const { uploadExcel, checkUploadedFiles } = require('./upload');

// Schema cho tham số đường dẫn: requestId phải là UUID
const idParams = z.object({ requestId: z.uuid() });

const validateParams = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
        throw new AppError(400, 'INVALID_REQUEST_ID', 'requestId không hợp lệ.', result.error.issues.map((i) => i.message));
    }
    next();
};

// Handler mỏng: đọc input, gọi service, trả JSON. Lỗi (kể cả Promise bị reject) tự đi tới middleware lỗi.
function createRouter(service) {
    const router = express.Router();

    router.post('/upload', uploadExcel, checkUploadedFiles, async (req, res) => {
        const { requestId, total } = await service.createRequest(req.files);
        res.status(202).json({ status: 'queued', requestId, total, statusUrl: `/status/${requestId}` });
    });

    router.get('/status/:requestId', validateParams(idParams), async (req, res) => {
        res.json(await service.getStatus(req.params.requestId));
    });

    router.get('/download/:requestId', validateParams(idParams), async (req, res) => {
        const { zipPath, downloadName } = await service.getZipFile(req.params.requestId);
        res.download(zipPath, downloadName); // không xóa sau khi tải: tải lại được tới khi hết hạn
    });

    return router;
}

module.exports = { createRouter };
