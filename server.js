const fs = require('fs');
const config = require('./src/config');
const { createApp } = require('./src/app');
const { createConversionService } = require('./src/service');

// Lưới an toàn cuối cùng: lỗi nằm ngoài chuỗi request thì ghi log rồi thoát (Docker sẽ khởi động lại)
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION', err);
    process.exit(1);
});

async function main() {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.mkdirSync(config.outputDir, { recursive: true });

    const service = createConversionService();
    await service.ready(); // chỉ mở cổng khi đã kết nối được Redis
    const server = createApp(service).listen(config.port, () => {
        console.log(`API Server tại: http://localhost:${config.port}`);
    });

    const shutdown = async () => {
        server.close();
        await service.close();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main();
