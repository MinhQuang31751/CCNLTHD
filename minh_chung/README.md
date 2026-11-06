# Minh chứng kiểm thử bản cuối

Log gốc của các ca kiểm thử trong báo cáo (Bảng 9.2, Phụ lục B). Các ca chạy ngày 04/11/2026 trên máy ảo Linux của Claude (môi trường C: Ubuntu 24.04.5 LTS, 2 vCPU, Node.js 24.22.2, Redis 7.0.15, LibreOffice 24.2.7.2), bằng đúng `server.js` và `worker-service.js` của thư mục này. Dòng đầu mỗi file ghi ngày giờ và phiên bản các thành phần.

| File | Nội dung |
| --- | --- |
| `t01.txt` … `t31.txt` | Log của 31 ca T01–T31, mỗi ca một file, tên trùng mã ca trong Bảng 9.2 |
| `p1.txt` | Độ trễ GET /status khi một request 20 file đang chờ (Kết quả 6.1) |
| `p3.txt` | Thời gian xử lý 20 file theo năm cấu hình worker, mỗi cấu hình 2 lần (Bảng 5.1) |
| `p3_phien_ban_dau.txt` | Cùng phép đo trên phiên bản đầu, cùng máy, cùng ngày, làm mốc so sánh |
| `lich_su_24-10/` | Hai log của lần Claude chạy thử bản 24/10 trên máy ảo, được nhắc ở mục 10.3 của báo cáo |
| `kich_ban/` | Các kịch bản đã dùng để chạy những ca trên |

## Kịch bản (`kich_ban/`)

- `final_env.sh`: biến và hàm dùng chung. Các đường dẫn ở đầu file (`S`, `APP`, `DATA`, thư mục Node.js) là đường dẫn trên máy ảo đã chạy; sửa lại trước khi chạy trên máy khác.
- `final_cases.sh`: các ca `t01` … `t31`, `p1`, `p3`. Chạy từng ca, ví dụ `bash final_cases.sh t09 t11`; mỗi ca dừng mọi tiến trình, xóa Redis và thư mục tạm, chạy lại API và worker rồi ghi log vào thư mục minh chứng.
- `p3_v1.sh`: phép đo P3 trên phiên bản đầu.
- `gen_data.py`: sinh các file Excel thử bằng openpyxl: `python3 gen_data.py <thư mục>`.
- `ui_check.js`: kiểm tra giao diện dưới CSP bằng Playwright (ca T31).

Các kịch bản dùng lệnh của Linux (`kill -STOP`, `redis-cli`, `pkill`) và cần Redis, LibreOffice; không chạy trực tiếp trên Windows. Để kiểm tra nhanh trên máy bất kỳ, dùng `npm test` và `npm run test:e2e` (README ở thư mục gốc).
