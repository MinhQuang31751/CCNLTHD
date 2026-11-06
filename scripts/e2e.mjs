// Kiểm thử đầu-cuối với hệ thống đang chạy thật (API + worker + Redis + LibreOffice): npm run test:e2e
// Upload 2 file mẫu, chờ xong, tải ZIP rồi kiểm tra nội dung. Exit code 0 khi mọi ca đạt, 1 khi có ca sai.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const BASE = process.env.BASE || 'http://localhost:3000';
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const FILES = ['Báo cáo doanh thu Q3.xlsx', 'Bảng lương chi tiết.xlsx']; // 5 cột và 24 cột
const ctx = {};

// Khổ trang của trang đầu tiên trong file PDF: [rộng, cao] tính bằng point
const pageSize = (pdf) => pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/).slice(1).map(Number);

const cases = [
    ['upload 2 file → 202 queued', async () => {
        const form = new FormData();
        for (const name of FILES) form.append('excelFiles', new Blob([fs.readFileSync(path.join(FIXTURES, name))]), name);
        const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
        const body = await res.json();
        assert.equal(res.status, 202);
        assert.equal(body.status, 'queued');
        assert.equal(body.total, 2);
        ctx.id = body.requestId;
    }],
    ['trạng thái chuyển sang done trong 120 s, không file nào lỗi', async () => {
        const deadline = Date.now() + 120_000;
        let body;
        do {
            await new Promise((r) => setTimeout(r, 1000));
            body = await (await fetch(`${BASE}/status/${ctx.id}`)).json();
        } while (body.status === 'processing' && Date.now() < deadline);
        assert.equal(body.status, 'done');
        assert.equal(body.done, 2);
        assert.equal(body.failed, 0);
        ctx.zipUrl = body.zipUrl;
    }],
    ['tải ZIP → 200, có 2 file PDF đúng tên', async () => {
        const res = await fetch(BASE + ctx.zipUrl);
        assert.equal(res.status, 200);
        const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
        ctx.pdf = Object.fromEntries(zip.getEntries().map((e) => [e.entryName, e.getData()]));
        assert.deepEqual(Object.keys(ctx.pdf).sort(), ['Bang_luong_chi_tiet.pdf', 'Bao_cao_doanh_thu_Q3.pdf']);
        for (const data of Object.values(ctx.pdf)) assert.equal(data.subarray(0, 5).toString(), '%PDF-');
    }],
    ['bảng 24 cột in khổ ngang, bảng 5 cột giữ khổ dọc', async () => {
        const [w1, h1] = pageSize(ctx.pdf['Bang_luong_chi_tiet.pdf']);
        const [w2, h2] = pageSize(ctx.pdf['Bao_cao_doanh_thu_Q3.pdf']);
        assert.ok(w1 > h1, `bảng lương: ${w1}x${h1}`);
        assert.ok(w2 < h2, `báo cáo doanh thu: ${w2}x${h2}`);
    }],
    ['tải lại lần hai vẫn được (ZIP chưa bị xóa)', async () => {
        const res = await fetch(BASE + ctx.zipUrl);
        assert.equal(res.status, 200);
        await res.arrayBuffer();
    }],
];

let failed = 0;
for (const [name, fn] of cases) {
    try {
        await fn();
        console.log(`ĐẠT  ${name}`);
    } catch (err) {
        failed++;
        console.log(`SAI  ${name}: ${err.message.split('\n')[0]}`);
        break; // các ca sau phụ thuộc ca trước
    }
}
console.log(`${failed ? 'Có ca sai' : `${cases.length}/${cases.length} ca đạt`}`);
process.exit(failed ? 1 : 0);
