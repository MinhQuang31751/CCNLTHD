// Kiểm thử tầng HTTP bằng Supertest; tầng dữ liệu (BullMQ/Redis) được thay bằng service giả
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OUTPUT_DIR = path.join(tmp, 'output');
process.env.MAX_FILE_MB = '1';
fs.mkdirSync(process.env.UPLOAD_DIR);
fs.mkdirSync(process.env.OUTPUT_DIR);

const request = require('supertest');
const { createApp } = require('../src/app');
const { AppError } = require('../src/errors');

const ID = '11111111-1111-4111-8111-111111111111';
const XLSX = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(200)]); // chỉ cần đúng chữ ký ZIP
const notFound = async () => { throw new AppError(404, 'REQUEST_NOT_FOUND', 'Request không tồn tại hoặc đã hết hạn.'); };

function fakeService(overrides = {}) {
    const calls = [];
    return {
        calls,
        createRequest: async (files) => { calls.push(files.length); return { requestId: ID, total: files.length }; },
        getStatus: notFound,
        getZipFile: notFound,
        ...overrides,
    };
}
const uploadsLeft = () => fs.readdirSync(process.env.UPLOAD_DIR).length;
const clearUploads = () => fs.readdirSync(process.env.UPLOAD_DIR).forEach((f) => fs.rmSync(path.join(process.env.UPLOAD_DIR, f)));
test.beforeEach(clearUploads);

test('POST /upload hợp lệ: 202, gọi service với đủ file', async () => {
    const svc = fakeService();
    const res = await request(createApp(svc)).post('/upload')
        .attach('excelFiles', XLSX, 'Báo cáo.xlsx').attach('excelFiles', XLSX, 'b.xlsx');
    assert.equal(res.status, 202);
    assert.equal(res.body.status, 'queued');
    assert.deepEqual(svc.calls, [2]);
});

test('POST /upload không có file: 400 NO_FILES', async () => {
    const res = await request(createApp(fakeService())).post('/upload');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NO_FILES');
});

test('POST /upload file .txt: 400 INVALID_FILE_TYPE, không còn file tạm', async () => {
    const res = await request(createApp(fakeService())).post('/upload')
        .attach('excelFiles', XLSX, 'a.xlsx').attach('excelFiles', Buffer.from('abc'), 'ghi_chu.txt');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_FILE_TYPE');
    assert.equal(uploadsLeft(), 0);
});

test('POST /upload file văn bản đổi đuôi .xlsx: 400 INVALID_FILE_CONTENT, nêu tên file', async () => {
    const res = await request(createApp(fakeService())).post('/upload')
        .attach('excelFiles', XLSX, 'a.xlsx').attach('excelFiles', Buffer.from('khong phai excel'), 'file_hong.xlsx');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_FILE_CONTENT');
    assert.deepEqual(res.body.details.files, ['file_hong.xlsx']);
    assert.equal(uploadsLeft(), 0);
});

test('POST /upload 51 file: 400 TOO_MANY_FILES (JSON, không phải HTML)', async () => {
    let req = request(createApp(fakeService())).post('/upload');
    for (let i = 0; i < 51; i++) req = req.attach('excelFiles', XLSX, `f${i}.xlsx`);
    const res = await req;
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'TOO_MANY_FILES');
    assert.match(res.headers['content-type'], /json/);
    assert.equal(uploadsLeft(), 0);
});

test('POST /upload sai tên trường: 400 UNEXPECTED_FIELD', async () => {
    const res = await request(createApp(fakeService())).post('/upload').attach('files', XLSX, 'a.xlsx');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNEXPECTED_FIELD');
});

test('POST /upload file vượt MAX_FILE_MB: 413 FILE_TOO_LARGE, không còn file tạm', async () => {
    const big = Buffer.concat([XLSX, Buffer.alloc(1024 * 1024 + 10)]);
    const res = await request(createApp(fakeService())).post('/upload').attach('excelFiles', big, 'lon.xlsx');
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'FILE_TOO_LARGE');
    assert.equal(uploadsLeft(), 0);
});

test('Mất Redis khi tạo request: 503 QUEUE_UNAVAILABLE, file đã nhận bị xóa', async () => {
    const svc = fakeService({
        createRequest: async () => { throw new Error("Stream isn't writeable and enableOfflineQueue options is false"); },
    });
    const res = await request(createApp(svc)).post('/upload').attach('excelFiles', XLSX, 'a.xlsx');
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'QUEUE_UNAVAILABLE');
    assert.equal(uploadsLeft(), 0);
});

test('Redis không trả lời quá thời hạn (Command timed out): 503 QUEUE_UNAVAILABLE', async () => {
    const svc = fakeService({ getStatus: async () => { throw new Error('Command timed out'); } });
    const res = await request(createApp(svc)).get(`/status/${ID}`);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'QUEUE_UNAVAILABLE');
});

test('Redis từ chối ghi trong giao dịch MULTI (EXECABORT do OOM): 503', async () => {
    const svc = fakeService({
        createRequest: async () => {
            const err = new Error('EXECABORT Transaction discarded because of previous errors.');
            err.previousErrors = [new Error("OOM command not allowed when used memory > 'maxmemory'.")];
            throw err;
        },
    });
    const res = await request(createApp(svc)).post('/upload').attach('excelFiles', XLSX, 'a.xlsx');
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'QUEUE_UNAVAILABLE');
    assert.equal(uploadsLeft(), 0);
});

test('Lỗi lập trình trong service: 500 JSON, không lộ stack trace', async () => {
    const svc = fakeService({ getStatus: async () => { throw new TypeError('x is not a function'); } });
    const res = await request(createApp(svc)).get(`/status/${ID}`);
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /TypeError|at /);
    assert.equal(res.body.traceId, res.headers['x-trace-id']);
});

test('GET /status với requestId sai định dạng: 400 INVALID_REQUEST_ID', async () => {
    const res = await request(createApp(fakeService())).get('/status/abc');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_REQUEST_ID');
});

test('GET /status với requestId không có: 404 JSON', async () => {
    const res = await request(createApp(fakeService())).get(`/status/${ID}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'REQUEST_NOT_FOUND');
});

test('Đường dẫn cũ /download-zip/package.json không còn: 404 NOT_FOUND', async () => {
    const res = await request(createApp(fakeService())).get('/download-zip/package.json');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
});

test('GET /download tải được nhiều lần, file không bị xóa', async () => {
    const zipPath = path.join(process.env.OUTPUT_DIR, `${ID}.zip`);
    fs.writeFileSync(zipPath, 'zip-data');
    const svc = fakeService({ getZipFile: async () => ({ zipPath, downloadName: 'Ket_Qua_Convert_11111111.zip' }) });
    const app = createApp(svc);
    for (let i = 0; i < 2; i++) {
        const res = await request(app).get(`/download/${ID}`);
        assert.equal(res.status, 200);
        assert.match(res.headers['content-disposition'], /Ket_Qua_Convert_11111111\.zip/);
    }
    assert.ok(fs.existsSync(zipPath));
});
