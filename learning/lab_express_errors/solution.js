// Lab: lỗi bất đồng bộ, validation và thời hạn trong Express 5 – ĐÁP ÁN
const express = require('express');
const { z } = require('zod');

class AppError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const jobs = new Map([['11111111-1111-4111-8111-111111111111', { state: 'completed' }]]);
const queue = {
    async getJob(id) {
        if (process.env.QUEUE_DOWN === '1') return new Promise(() => {});
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new TypeError(`invalid job id: ${id}`);
        return jobs.get(id) || null;
    },
};

// Bước 5: biến "treo" thành lỗi có thời hạn
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AppError(503, 'QUEUE_UNAVAILABLE', 'Hàng đợi không phản hồi, vui lòng thử lại sau.')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Bước 3: kiểm tra tham số đường dẫn bằng zod, chặn trước khi gọi hàng đợi
const jobParams = z.object({ id: z.uuid() });
const validateParams = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'id phải là UUID hợp lệ.');
    req.validated = result.data;
    next();
};

const app = express();

// Bước 4: handler async không try/catch; Express 5 tự chuyển lỗi tới middleware lỗi
app.get('/jobs/:id', validateParams(jobParams), async (req, res) => {
    const job = await withTimeout(queue.getJob(req.validated.id), 2000);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Không có job này.');
    res.json({ id: req.validated.id, state: job.state });
});

// Bước 2: route không khớp → 404 JSON; đặt SAU mọi route
app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', `Không có ${req.method} ${req.path}`)));

// Bước 1: middleware lỗi đủ 4 tham số, đặt CUỐI CÙNG
app.use((err, req, res, next) => {
    const known = err instanceof AppError;
    if (!known) console.error(err); // stack trace chỉ ghi vào log
    res.status(known ? err.status : 500).json({
        status: 'error',
        code: known ? err.code : 'INTERNAL_ERROR',
        message: known ? err.message : 'Lỗi hệ thống, vui lòng thử lại sau.',
    });
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`solution: http://localhost:${PORT}`));
