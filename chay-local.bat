@echo off
chcp 65001 >nul
rem Chạy dự án trên máy, không dùng Docker: mở 3 cửa sổ Redis, API, Worker rồi mở trình duyệt.
rem Đóng cửa sổ nào thì thành phần đó tắt.
cd /d "%~dp0"
set "REDIS_DIR=%LOCALAPPDATA%\Programs\Redis\Redis-8.10.3-Windows-x64-msys2"

if not exist "%REDIS_DIR%\redis-server.exe" (
    echo Không tìm thấy Redis ở "%REDIS_DIR%".
    pause
    exit /b 1
)

rem 1. Redis: chỉ mở khi chưa có Redis nào đang chạy
"%REDIS_DIR%\redis-cli.exe" ping >nul 2>&1
if errorlevel 1 (
    echo Đang mở Redis...
    start "Redis" /D "%REDIS_DIR%" "%REDIS_DIR%\redis-server.exe" --bind 127.0.0.1 --port 6379
) else (
    echo Redis đã chạy sẵn, bỏ qua.
)

rem 2. API và Worker: chỉ mở khi chưa có tiến trình nào đang chạy
rem    (kể cả bản đang chờ Redis: bản đó tự kết nối khi Redis lên, mở thêm sẽ tranh cổng 3000)
call :running "node\s+server\.js"
if errorlevel 1 (
    echo Đang mở API...
    start "API" cmd /k npm start
) else (
    echo API đã chạy sẵn, bỏ qua.
)
call :running "node\s+worker-service\.js"
if errorlevel 1 (
    echo Đang mở Worker...
    start "Worker" cmd /k npm run worker
) else (
    echo Worker đã chạy sẵn, bỏ qua.
)

rem 3. Chờ API sẵn sàng (tối đa 60 giây) rồi mở trình duyệt
echo Đang chờ API sẵn sàng...
set /a tries=0
:wait
curl -s -o nul http://localhost:3000 >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% GEQ 60 (
    echo Sau 60 giây API vẫn chưa chạy, xem lỗi trong cửa sổ Redis và API.
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo API đã chạy: http://localhost:3000
start "" http://localhost:3000
exit /b 0

rem Trả về 0 nếu có tiến trình node.exe mà dòng lệnh khớp biểu thức %1, ngược lại trả về 1
:running
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter 'Name=''node.exe''' | Where-Object { $_.CommandLine -match '%~1' }) { exit 0 } else { exit 1 }"
exit /b %errorlevel%
