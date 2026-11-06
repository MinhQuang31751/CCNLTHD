const fs = require('fs/promises');
const path = require('path');
const { Worker } = require('bullmq');
const libre = require('libreoffice-convert');
const AdmZip = require('adm-zip');
const config = require('./src/config');
const { fitColumnsToPage } = require('./src/pagesetup');

const connection = { ...config.redis, maxRetriesPerRequest: null };
const logTime = () => new Date().toLocaleString('vi-VN');
const log = (msg) => console.log(`[${logTime()}] ${msg}`);
const exists = (p) => fs.access(p).then(() => true, () => false);

// ============================================================
// 1. Job con: chuyển một file Excel sang PDF
//    Không xóa file đầu vào ở đây, để lần thử lại vẫn đọc được file.
// ============================================================
async function convertExcelToPdf(inputFile, outputFile) {
    let excelBuf = await fs.readFile(inputFile);
    try {
        excelBuf = fitColumnsToPage(excelBuf); // mọi cột vừa một trang ngang, sheet rộng thì xoay ngang
    } catch (err) { // không đọc được cấu trúc file: chuyển nguyên bản như trước
        log(`Bỏ qua chỉnh khổ trang ${path.basename(inputFile)}: ${err.message}`);
    }
    const pdfBuf = await new Promise((resolve, reject) => {
        // execOptions.timeout: quá hạn thì giết tiến trình soffice, job lỗi và được thử lại
        const options = { execOptions: { timeout: config.convertTimeoutMs, killSignal: 'SIGKILL' } };
        libre.convertWithOptions(excelBuf, '.pdf', undefined, options, (err, done) => (err ? reject(err) : resolve(done)));
    });
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(`${outputFile}.tmp`, pdfBuf); // ghi file tạm rồi đổi tên: không có PDF viết dở
    await fs.rename(`${outputFile}.tmp`, outputFile);
}

const convertWorker = new Worker(config.convertQueue, async (job) => {
    const { requestId, originalName, inputFile, outputFile } = job.data;
    log(`[REQ:${requestId}] START (lần ${job.attemptsMade + 1}): ${originalName}`);
    await convertExcelToPdf(inputFile, outputFile);
    log(`[REQ:${requestId}] DONE: ${path.basename(outputFile)}`);
    return { pdf: path.basename(outputFile) };
}, { connection, concurrency: config.workerConcurrency });

// ============================================================
// 2. Job cha: BullMQ chỉ chạy job này MỘT lần, khi mọi job con đã kết thúc
//    (thành công hoặc hết lượt thử). Nén ZIP rồi dọn file tạm của request.
// ============================================================
const zipWorker = new Worker(config.zipQueue, async (job) => {
    const { requestId, names, inputs, outputDir } = job.data;
    const pdfs = Object.values(await job.getChildrenValues()).map((v) => v.pdf);
    const failures = await job.getIgnoredChildrenFailures(); // { 'bull:excel-convert:<id>-<i>': lý do }
    const failedFiles = Object.entries(failures).map(([key, reason]) => ({
        file: names[Number(key.slice(key.lastIndexOf('-') + 1))],
        reason,
    }));

    const zipPath = path.join(config.outputDir, `${requestId}.zip`);
    if (!(await exists(zipPath))) { // job chạy lại sau khi worker chết: ZIP đã có thì không tạo lại
        const zip = new AdmZip();
        for (const pdf of pdfs) zip.addLocalFile(path.join(outputDir, pdf));
        await zip.writeZipPromise(`${zipPath}.tmp`);
        await fs.rename(`${zipPath}.tmp`, zipPath);
    }
    await Promise.all(inputs.map((f) => fs.rm(f, { force: true }))); // file Excel đã nhận
    await fs.rm(outputDir, { recursive: true, force: true });         // thư mục PDF tạm

    log(`[REQ:${requestId}] ZIP: ${pdfs.length} PDF, ${failedFiles.length} file lỗi`);
    return { done: pdfs.length, failed: failedFiles.length, failedFiles };
}, { connection, concurrency: 1 });

for (const w of [convertWorker, zipWorker]) {
    w.on('failed', (job, err) => log(`Fail ${job?.queueName} ${job?.id} (lần ${job?.attemptsMade}): ${err.message}`));
    w.on('error', (err) => log(`WORKER ERROR: ${err.message}`));
}

// ============================================================
// 3. Dọn file quá hạn (ZIP không ai tải, file sót lại khi tiến trình chết)
// ============================================================
async function sweep() {
    const limit = Date.now() - config.resultTtlSeconds * 1000;
    for (const dir of [config.uploadDir, config.outputDir]) {
        for (const name of await fs.readdir(dir).catch(() => [])) {
            const p = path.join(dir, name);
            const st = await fs.stat(p).catch(() => null);
            if (st && st.mtimeMs < limit) {
                await fs.rm(p, { recursive: true, force: true });
                log(`SWEEP: ${path.basename(dir)}/${name}`);
            }
        }
    }
}
const runSweep = () => sweep().catch((err) => log(`SWEEP ERROR: ${err.message}`));
setInterval(runSweep, config.sweepIntervalSeconds * 1000).unref();
runSweep();

// ============================================================
// 4. Tắt an toàn: ngừng nhận job mới, chờ job đang chạy xong rồi mới thoát
// ============================================================
async function shutdown(signal) {
    log(`Nhận ${signal}, đang đóng worker...`);
    await Promise.all([convertWorker.close(), zipWorker.close()]);
    log('Đã đóng worker.');
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log(`Worker Service đang chạy | Concurrency: ${config.workerConcurrency} | Redis: ${config.redis.host}:${config.redis.port}`);
