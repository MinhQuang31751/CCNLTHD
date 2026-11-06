# Chuyển Excel sang PDF hàng loạt (bản cải tiến)

Express 5, BullMQ (Redis) và LibreOffice. API nhận nhiều file `.xlsx`, worker chuyển từng file sang PDF rồi nén tất cả vào một file ZIP.

## Cấu trúc

| File | Vai trò |
|---|---|
| `server.js` | Khởi động API. Chỉ mở cổng khi đã kết nối được Redis, tắt an toàn khi nhận SIGTERM hoặc SIGINT |
| `worker-service.js` | Worker: job con chuyển một file sang PDF (thử tối đa 3 lần), job cha nén ZIP, dọn file quá hạn |
| `src/app.js` | Ráp middleware theo thứ tự: log và mã truy vết, file tĩnh, JSON, route, 404, middleware lỗi |
| `src/routes.js` | `POST /upload`, `GET /status/:requestId`, `GET /download/:requestId`; kiểm tra `requestId` bằng zod |
| `src/upload.js` | Multer (số file, dung lượng, đuôi `.xlsx`) và kiểm tra chữ ký ZIP của từng file |
| `src/service.js` | Tạo request (1 job cha và N job con trong một giao dịch Redis), đọc trạng thái từ Redis |
| `src/errors.js` | Lớp `AppError` mang mã HTTP và mã lỗi |
| `src/filename.js` | Giữ tên tiếng Việt, bỏ dấu, thêm hậu tố khi trùng tên PDF |
| `src/pagesetup.js` | Sửa thiết lập in trước khi chuyển: mọi cột vừa một trang ngang (thu nhỏ khi cần), sheet rộng hơn khổ dọc thì xoay ngang |
| `src/config.js` | Đọc biến môi trường, mẫu ở `.env.example` |
| `test/` | Kiểm thử bằng `node:test` và Supertest, không cần Redis |

## Chạy trên máy

Cần Node.js 20 trở lên, Redis ở `127.0.0.1:6379` và LibreOffice.

```bash
npm ci
npm start          # API tại http://localhost:3000
npm run worker     # chạy ở cửa sổ thứ hai
```

Muốn đổi cấu hình: chép `.env.example` thành `.env`, sửa giá trị, rồi chạy `node --env-file=.env server.js` và `node --env-file=.env worker-service.js`.

## Kiểm thử

```bash
npm test
```

## Docker

```bash
docker compose up --build
```
