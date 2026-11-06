// Kiểm tra lab: node check.mjs (server chạy thường) hoặc node check.mjs --down (server chạy với QUEUE_DOWN=1)
// Exit code 0 khi mọi ca đạt, 1 khi có ca sai.
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3300';
const OK_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_ID = '22222222-2222-4222-8222-222222222222';

async function get(path) {
    const started = Date.now();
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    return { status: res.status, json, text, ms: Date.now() - started };
}

const normal = [
    ['job tồn tại → 200', async () => {
        const r = await get(`/jobs/${OK_ID}`);
        assert.equal(r.status, 200);
        assert.equal(r.json?.state, 'completed');
    }],
    ['id sai dạng → 400 VALIDATION_ERROR', async () => {
        const r = await get('/jobs/abc');
        assert.equal(r.status, 400);
        assert.equal(r.json?.code, 'VALIDATION_ERROR');
    }],
    ['job không tồn tại → 404 JOB_NOT_FOUND', async () => {
        const r = await get(`/jobs/${MISSING_ID}`);
        assert.equal(r.status, 404);
        assert.equal(r.json?.code, 'JOB_NOT_FOUND');
    }],
    ['route không có → 404 JSON NOT_FOUND', async () => {
        const r = await get('/khong-co');
        assert.equal(r.status, 404);
        assert.equal(r.json?.code, 'NOT_FOUND');
    }],
    ['phản hồi lỗi không lộ stack trace', async () => {
        const r = await get(`/jobs/${MISSING_ID}`);
        assert.doesNotMatch(r.text, /TypeError|\n\s+at /);
    }],
];

const down = [
    ['hàng đợi treo → 503 QUEUE_UNAVAILABLE trong khoảng 2 s', async () => {
        const r = await get(`/jobs/${OK_ID}`);
        assert.equal(r.status, 503);
        assert.equal(r.json?.code, 'QUEUE_UNAVAILABLE');
        assert.ok(r.ms < 3500, `mất ${r.ms} ms`);
    }],
];

const cases = process.argv.includes('--down') ? down : normal;
let failed = 0;
for (const [name, fn] of cases) {
    try {
        await fn();
        console.log(`ĐẠT  ${name}`);
    } catch (err) {
        failed++;
        const detail = err.operator === 'strictEqual' ? `nhận ${err.actual}, mong đợi ${err.expected}`
            : err.operator === 'doesNotMatch' ? 'phản hồi vẫn chứa stack trace'
            : err.message.split('\n')[0];
        console.log(`SAI  ${name}: ${detail}`);
    }
}
console.log(`${cases.length - failed}/${cases.length} ca đạt`);
process.exit(failed ? 1 : 0);
