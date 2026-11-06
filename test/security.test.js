// Kiểm thử lớp bảo mật: header (helmet), CORS, giới hạn tần suất. Tầng dữ liệu được thay bằng service giả.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.OUTPUT_DIR = path.join(tmp, 'output');
process.env.UPLOAD_RATE_LIMIT = '2'; // giới hạn nhỏ để thử nhanh
fs.mkdirSync(process.env.UPLOAD_DIR);
fs.mkdirSync(process.env.OUTPUT_DIR);

const express = require('express');
const request = require('supertest');
const { createApp } = require('../src/app');
const { corsMiddleware } = require('../src/security');

const ID = '11111111-1111-4111-8111-111111111111';
const XLSX = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(200)]);
const fakeService = () => ({ createRequest: async (files) => ({ requestId: ID, total: files.length }) });
const uploadsLeft = () => fs.readdirSync(process.env.UPLOAD_DIR).length;

test('GET /: có CSP, chặn nhúng iframe, không có X-Powered-By', async () => {
    const res = await request(createApp(fakeService())).get('/');
    assert.equal(res.status, 200);
    const csp = res.headers['content-security-policy'];
    assert.match(csp, /script-src 'self' https:\/\/cdn\.tailwindcss\.com/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
});

test('index.html không còn script inline hay thuộc tính onclick (CSP sẽ chặn)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    for (const tag of html.match(/<script\b[^>]*>/g)) assert.match(tag, /\ssrc=/);
});

test('CORS mặc định: không gửi Access-Control-Allow-Origin cho origin lạ', async () => {
    const res = await request(createApp(fakeService())).get('/').set('Origin', 'http://trang-la.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('CORS khi khai báo origin: chỉ origin đó được phép', async () => {
    const app = express().use(corsMiddleware(['http://frontend.example'])).get('/', (req, res) => res.json({ ok: true }));
    const ok = await request(app).get('/').set('Origin', 'http://frontend.example');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://frontend.example');
    const other = await request(app).get('/').set('Origin', 'http://trang-la.example');
    assert.equal(other.headers['access-control-allow-origin'], undefined);
});

test('Upload lần thứ 3 khi UPLOAD_RATE_LIMIT=2: 429 JSON, file chưa được ghi xuống đĩa', async () => {
    const app = createApp(fakeService());
    for (let i = 0; i < 2; i++) {
        const ok = await request(app).post('/upload').attach('excelFiles', XLSX, 'a.xlsx');
        assert.equal(ok.status, 202);
        fs.readdirSync(process.env.UPLOAD_DIR).forEach((f) => fs.rmSync(path.join(process.env.UPLOAD_DIR, f)));
    }
    const res = await request(app).post('/upload').attach('excelFiles', XLSX, 'a.xlsx');
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'TOO_MANY_REQUESTS');
    assert.match(res.headers['content-type'], /json/);
    assert.ok(res.headers.ratelimit, 'có header RateLimit cho client biết khi nào thử lại');
    assert.equal(uploadsLeft(), 0);
});
