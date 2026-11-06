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

## Chạy dự án

Dự án cần 3 thành phần chạy cùng lúc: **API** (nhận file, phục vụ giao diện web), **worker** (chuyển file sang PDF bằng LibreOffice) và **Redis** (hàng đợi việc giữa API và worker).

Có 2 cách chạy. **Cách 1 (Docker) dễ hơn**: chỉ cần cài Docker, mọi thứ khác đã có sẵn trong container.

Tải mã nguồn về trước:

```bash
git clone https://github.com/MinhQuang31751/CCNLTHD.git
cd CCNLTHD
```

### Cách 1: Docker (nên dùng)

1. Cài [Docker Desktop](https://www.docker.com/products/docker-desktop/). Trên Windows, đồng ý bật WSL2 khi trình cài đặt hỏi.
2. Mở Docker Desktop, chờ tới khi góc dưới báo **Engine running**.
3. Trong thư mục dự án, chạy:

   ```bash
   docker compose up -d --build
   ```

   Lần đầu mất vài phút để tải Node.js và LibreOffice. Lệnh chạy 4 container: `redis`, `api` và 2 `worker`.
4. Mở trình duyệt: **http://localhost:3000**

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem các container đang chạy | `docker compose ps` |
| Xem log | `docker compose logs -f api worker` |
| Tắt dự án | `docker compose down` |
| Chạy lại sau khi sửa code | `docker compose up -d --build` |
| Tăng số worker (ví dụ 4) | `docker compose up -d --scale worker=4` |

### Cách 2: Chạy trực tiếp bằng Node.js

**Bước 1. Cài 3 phần mềm sau, mỗi máy chỉ cần cài một lần.** Lệnh `npm ci` ở bước 2 chỉ tải thư viện JavaScript, không cài các phần mềm này.

| Phần mềm | Cài thế nào | Kiểm tra |
|---|---|---|
| Node.js 20 trở lên | Tải ở [nodejs.org](https://nodejs.org) | `node -v` |
| LibreOffice | Tải ở [libreoffice.org](https://www.libreoffice.org/download/). Trên Windows giữ thư mục cài mặc định (`C:\Program Files\LibreOffice`) để code tự tìm thấy | Mở được LibreOffice |
| Redis (cổng 6379) | Windows: cài [Memurai](https://www.memurai.com/), hoặc nếu có Docker thì chạy `docker run -d --name redis -p 6379:6379 redis:7-alpine`<br>macOS: `brew install redis && brew services start redis`<br>Ubuntu: `sudo apt install redis-server` | `redis-cli ping` (Memurai: `memurai-cli ping`) trả `PONG`; bản Docker: `docker ps` thấy container `redis` |

**Bước 2. Cài thư viện** (chạy một lần, và chạy lại khi `package.json` thay đổi):

```bash
npm ci
```

**Bước 3. Mở 2 cửa sổ terminal trong thư mục dự án.** Phải chạy cả hai: API chỉ nhận file, worker mới là phần chuyển sang PDF.

```bash
# Cửa sổ 1: API và giao diện web
npm start
# Chạy đúng sẽ in ra: API Server tại: http://localhost:3000

# Cửa sổ 2: worker
npm run worker
# Chạy đúng sẽ in ra: Worker Service đang chạy | Concurrency: 4 | Redis: 127.0.0.1:6379
```

**Bước 4.** Mở trình duyệt: **http://localhost:3000**. Tắt bằng `Ctrl + C` ở từng cửa sổ.

**Đổi cấu hình** (cổng, địa chỉ Redis, giới hạn file...): chép `.env.example` thành `.env` (`copy .env.example .env` trên Windows, `cp .env.example .env` trên macOS/Linux), sửa giá trị, rồi chạy bằng `node --env-file=.env server.js` và `node --env-file=.env worker-service.js` thay cho `npm start` và `npm run worker`.

### Kiểm tra đã chạy đúng

- Mở trang web, chọn một hoặc nhiều file `.xlsx`, bấm **BẮT ĐẦU CHUYỂN ĐỔI**, chờ xong rồi tải file ZIP chứa các PDF về.
- Chạy `npm test` (cần `npm ci` trước, không cần Redis hay LibreOffice): mọi test phải báo `pass`.

### Lỗi thường gặp

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| `npm is not recognized` | Chưa cài Node.js, hoặc cần mở lại terminal sau khi cài |
| `npm start` không in ra `API Server tại...`, web không vào được | Redis chưa chạy. Bật Redis (xem bước 1) rồi chạy lại |
| Upload được nhưng file cứ ở trạng thái đang xử lý | Chưa chạy `npm run worker` |
| Upload được nhưng mọi file đều báo lỗi | Worker không tìm thấy LibreOffice. Cài LibreOffice vào thư mục mặc định rồi chạy lại `npm run worker` |
| `docker compose` báo lỗi kết nối tới `dockerDesktopLinuxEngine` | Docker Desktop chưa mở hoặc chưa khởi động xong |
| Lỗi `docker-credential-desktop` khi chạy trong Git Bash | Chạy lệnh bằng PowerShell hoặc CMD |
| `port is already allocated` hoặc `container name ... is already in use` | Cổng 3000/6379 hoặc tên container đang bị dự án khác dùng. Tắt dự án kia, hoặc đổi cổng như mục dưới |
| Cảnh báo `the attribute version is obsolete` | Vô hại, bỏ qua được |

### Chạy song song với dự án khác (đổi cổng Docker)

Tạo file `docker-compose.override.yml` cạnh `docker-compose.yml`. Docker Compose tự đọc file này, và file đã nằm trong `.gitignore` nên không bị đẩy lên git:

```yaml
services:
  redis:
    container_name: !reset null
    ports: !reset []
  api:
    container_name: !reset null
    ports: !override
      - "3001:3000"
```

Chạy lại `docker compose up -d --build`, giao diện chuyển sang **http://localhost:3001**. Xóa file này để quay về cổng 3000.
