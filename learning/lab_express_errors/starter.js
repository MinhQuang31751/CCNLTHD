// Lab: lỗi bất đồng bộ, validation và thời hạn trong Express 5 – bản STARTER (cố ý còn lỗi)
const express = require('express');

// "Hàng đợi" giả lập BullMQ: trả job, trả null nếu không có.
// QUEUE_DOWN=1: lời gọi treo mãi, giống lệnh Redis khi Redis không chạy (mục 4.4 của báo cáo).
const jobs = new Map([['11111111-1111-4111-8111-111111111111', { state: 'completed' }]]);
const queue = {
    async getJob(id) {
        if (process.env.QUEUE_DOWN === '1') return new Promise(() => {});
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new TypeError(`invalid job id: ${id}`);
        return jobs.get(id) || null;
    },
};

const app = express();

app.get('/jobs/:id', async (req, res) => {
    const job = await queue.getJob(req.params.id);
    res.json({ id: req.params.id, state: job.state });
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`starter: http://localhost:${PORT}`));
