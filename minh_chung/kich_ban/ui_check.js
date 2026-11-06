// Kiểm tra giao diện dưới CSP bằng Chromium (Playwright): mở trang, chọn 2 file, bấm nút, chờ màn hình hoàn tất.
// Dùng: node ui_check.js <thư mục fixtures> ; in ra từng bước, vi phạm CSP và lỗi console.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const fx = process.argv[2];
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    // Ghi lại mọi vi phạm CSP mà trình duyệt báo
    await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`));
    });
    const res = await page.goto('http://localhost:3000/', { waitUntil: 'load' });
    console.log(`GET / -> ${res.status()}`);
    console.log(`script đã tải: ${(await page.evaluate(() => [...document.scripts].map((s) => s.src || '(inline)'))).join(', ')}`);
    await page.setInputFiles('#fileInput', ['Báo cáo doanh thu Q3.xlsx', 'Bảng lương chi tiết.xlsx'].map((f) => path.join(fx, f)));
    console.log(`sau khi chọn file: "${await page.textContent('#fileCount')}"`);
    const t0 = Date.now();
    await page.click('#startBtn');
    await page.waitForSelector('#finishUI:not(.hidden)', { timeout: 90000 });
    console.log(`màn hình hoàn tất sau ${((Date.now() - t0) / 1000).toFixed(1)} s: "${(await page.textContent('#finishDetail')).trim()}"`);
    console.log(`nút tải: href=${await page.getAttribute('#zipBtn', 'href')}`);
    const dl = await page.evaluate(async () => { const r = await fetch(document.getElementById('zipBtn').href); return `${r.status} ${r.headers.get('content-type')} ${(await r.arrayBuffer()).byteLength} B`; });
    console.log(`tải ZIP từ trang: ${dl}`);
    await page.click('[data-action="reset"] >> nth=0').catch(() => {});
    console.log(`bấm "Tiếp tục": khung upload ${await page.isVisible('#uploadSection') ? 'hiện lại' : 'không hiện'}`);
    const csp = await page.evaluate(() => window.__csp);
    console.log(`vi phạm CSP: ${csp.length ? csp.join(' | ') : 'không có'}`);
    console.log(`lỗi console: ${consoleErrors.length ? consoleErrors.join(' | ') : 'không có'}`);
    await browser.close();
})().catch((e) => { console.log('LỖI: ' + e.message); process.exit(1); });
