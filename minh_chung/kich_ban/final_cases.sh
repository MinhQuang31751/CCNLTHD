#!/bin/bash
# Kiểm thử bản cuối. Dùng: bash final_cases.sh t01 [t02 ...]  — mỗi ca ghi log gốc vào evidence/final/<ca>.txt
source "$(dirname "$0")/final_env.sh"

head_info() { echo "# $(date '+%d/%m/%Y %H:%M:%S %Z') | $(node -v) | $(redis-server --version | cut -d' ' -f3) | $(soffice --version | cut -d' ' -f1-2) | $(. /etc/os-release; echo $PRETTY_NAME), $(nproc) vCPU"; }

t01() { fresh 2; echo "\$ curl -i $B/   (dòng trạng thái và các header liên quan)"
  curl -s -D - -o /dev/null $B/ | tr -d '\r' | grep -iE "^HTTP|content-security|x-trace-id|x-powered|x-content-type|x-frame|ratelimit"
  echo "\$ curl -s -o /dev/null $B/app.js"; curl -s -o /dev/null -w 'GET /app.js -> HTTP %{http_code} | %{content_type}\n' $B/app.js
  echo "--- log API"; cat $LOGS/api.log; }

t02() { fresh 2; for u in /khong-ton-tai "/download-zip/..%2F..%2Fpackage.json" "/download/..%2F..%2Fpackage.json"; do
    echo "\$ curl \"$B$u\""; curl -s -w '\nHTTP %{http_code}\n' "$B$u"; done
  echo "\$ ls -l package.json"; (cd $APP && ls -l package.json | awk '{print $5, $9}'); }

t03() { fresh 2; for u in /status/abc /status/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10 /download/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10; do
    echo "\$ curl $B$u"; curl -s -w '\nHTTP %{http_code}\n' $B$u; done; }

t04() { fresh 2; echo "\$ curl -X POST $B/upload   (không kèm file)"; curl -s -w '\nHTTP %{http_code} | %{content_type}\n' -X POST $B/upload; }

t05() { fresh 2; echo "# 1 file Excel thật + ghi_chu.txt (sai đuôi)"
  upload "$DATA/special" "Báo cáo doanh thu Q3.xlsx" "ghi_chu.txt"; listdirs
  echo "# 1 file Excel thật + file_hong.xlsx (văn bản đổi đuôi thành .xlsx)"
  upload "$DATA/special" "Báo cáo doanh thu Q3.xlsx" "file_hong.xlsx"; listdirs
  echo "\$ head -c 40 file_hong.xlsx"; head -c 40 "$DATA/special/file_hong.xlsx"; echo; }

t06() { fresh 2; echo "\$ curl -F files=@Ton_kho_01.xlsx $B/upload   (sai tên trường)"
  curl -s -w '\nHTTP %{http_code}\n' -F "files=@$DATA/many51/Ton_kho_01.xlsx" $B/upload; listdirs; }

t07() { fresh 2; local args=(); for f in $DATA/many51/*.xlsx; do args+=(-F "excelFiles=@$f"); done
  echo "\$ curl -F excelFiles=@Ton_kho_01.xlsx … (51 file) $B/upload"
  curl -s -w '\nHTTP %{http_code} | %{content_type}\n' "${args[@]}" $B/upload; listdirs; }

t08() { fresh 1; echo "\$ ls -l big_100MB.xlsx"; ls -l $DATA/big/big_100MB.xlsx | awk '{print $5, "big_100MB.xlsx"}'
  echo "\$ curl -F excelFiles=@big_100MB.xlsx $B/upload"
  curl -s -w '\nHTTP %{http_code} | đã gửi %{size_upload} B | %{time_total}s\n' -F "excelFiles=@$DATA/big/big_100MB.xlsx" $B/upload; sleep 1; listdirs; }

t09() { fresh 2; local R ID ST U
  echo "# 3 file tên tiếng Việt: upload, hỏi trạng thái mỗi giây, tải ZIP"
  R=$(upload "$DATA/basic" "Báo cáo doanh thu Q3.xlsx" "Danh sách lớp DCT01.xlsx" "Bảng chấm công tháng 9.xlsx"); echo "$R"
  ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 1 90); echo "$ST"; U=$(echo "$ST" | zipurl)
  curl -s -o $S/tmp/t09.zip -w "GET $U -> HTTP %{http_code} | %{size_download} B | %{time_total}s\n" "$B$U"
  echo "\$ unzip -l ket_qua.zip"; unzip -l $S/tmp/t09.zip | sed -n '4,8p'
  echo "--- log worker"; cat $LOGS/w1.log; listdirs
  echo "--- log API (các dòng POST, 2 dòng status đầu, dòng download)"; grep -E '"POST"|download' $LOGS/api.log; grep '"/status' $LOGS/api.log | head -2; }

t10() { fresh 2; local R ID ST
  echo "# 4 file: hai cặp trùng tên sau khi chuẩn hóa"
  R=$(upload "$DATA/special" "Báo cáo doanh thu Q3.xlsx" "Bao cao doanh thu Q3.xlsx" "v1.2.xlsx" "v1.3.xlsx"); echo "$R" | head -1
  ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 1 90); echo "$ST" | tail -1
  curl -s -o $S/tmp/t10.zip "$B$(echo "$ST" | zipurl)"; echo "\$ unzip -l ket_qua.zip"; unzip -l $S/tmp/t10.zip | sed -n '4,9p'; }

t11() { fresh 2; local R ID ST
  echo "# 1 file Excel hỏng (3.000 byte đầu của một file thật, qua được kiểm tra chữ ký) + 2 file tốt"
  R=$(upload "$DATA/special" "Bao_cao_bi_hong.xlsx" "Báo cáo doanh thu Q3.xlsx" "v1.2.xlsx"); echo "$R" | head -1
  ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 2 60); echo "$ST" | tail -2
  curl -s -o $S/tmp/t11.zip "$B$(echo "$ST" | zipurl)"; echo "\$ unzip -l ket_qua.zip"; unzip -l $S/tmp/t11.zip | sed -n '4,7p'
  echo "--- log worker"; cat $LOGS/w1.log; listdirs; }

t12() { fresh 1; local R ID
  echo "# file 12.000 dòng; khi soffice.bin đang chạy lần đầu thì kill -9 (giả lập LibreOffice chết giữa chừng)"
  R=$(upload "$DATA/heavy" "Nhật ký bán hàng cả năm.xlsx"); echo "$R" | head -1; ID=$(echo "$R" | head -1 | reqid)
  for i in $(seq 1 200); do pgrep -f soffice.bin >/dev/null && break; sleep 0.1; done; sleep 0.5
  echo "[$(ts)] \$ pkill -9 -f soffice.bin"; pkill -9 -f soffice.bin
  poll $ID 2 60 | tail -1; echo "--- log worker"; cat $LOGS/w1.log; listdirs; }

t13() { fresh 1; local R ID PA
  echo "# kill -9 worker A khi đang xử lý; worker B nhận lại job"
  R=$(upload "$DATA/heavy" "Nhật ký bán hàng cả năm.xlsx"); echo "[$(ts)] POST /upload -> $(echo "$R" | head -1)"; ID=$(echo "$R" | head -1 | reqid)
  wait_log $LOGS/w1.log "START" 20; PA=$(cat $LOGS/w1.pid); sleep 0.5
  start_worker w2 WORKER_CONCURRENCY=1; echo "[$(ts)] worker B đã chạy"
  echo "[$(ts)] \$ kill -9 $PA   (worker A đang xử lý)"; kill -9 $PA; pkill -9 -f soffice.bin
  poll $ID 5 40 | awk 'NR==1 || /done|error/'
  echo "--- log worker A"; cat $LOGS/w1.log; echo "--- log worker B"; cat $LOGS/w2.log; listdirs; }

t14() { fresh 1; local R ID P
  echo "# SIGTERM worker khi đang xử lý"
  R=$(upload "$DATA/heavy" "Nhật ký bán hàng cả năm.xlsx"); echo "[$(ts)] POST /upload -> $(echo "$R" | head -1)"; ID=$(echo "$R" | head -1 | reqid)
  wait_log $LOGS/w1.log "START" 20; P=$(cat $LOGS/w1.pid); sleep 0.5
  echo "[$(ts)] \$ kill -TERM $P"; kill -TERM $P
  while kill -0 $P 2>/dev/null; do sleep 0.1; done; echo "[$(ts)] worker đã thoát"
  echo "--- log worker"; cat $LOGS/w1.log; echo "\$ curl /status/<id>"; curl -s $B/status/$ID; echo
  echo "[$(ts)] khởi động lại worker"; start_worker w1b WORKER_CONCURRENCY=1
  poll $ID 1 30 | tail -1; echo "--- log worker mới"; cat $LOGS/w1b.log; listdirs; }

t15() { fresh 2; local R ID files=()
  echo "# 10 file nhật ký, mỗi file 12.000 dòng; khởi động lại API khi request đang chạy"
  for f in $DATA/heavy10/*.xlsx; do files+=("$(basename $f)"); done
  R=$(upload "$DATA/heavy10" "${files[@]}"); echo "[$(ts)] POST /upload -> $(echo "$R" | head -1)"; ID=$(echo "$R" | head -1 | reqid)
  sleep 3; poll $ID 1 1
  echo "[$(ts)] \$ kill API (SIGTERM); node server.js"; stop_api; echo "[$(ts)] API đã dừng: $(curl -s -o /dev/null -w '%{http_code}' $B/status/$ID)"; start_api
  echo "[$(ts)] API đã chạy lại"; poll $ID 3 60 | sed -n '1p;$p'; listdirs; }

t16() { fresh 2; local P
  echo "# Redis dừng khi API đang chạy"; echo "[$(ts)] \$ redis-cli shutdown nosave"; stop_redis
  echo "[$(ts)] \$ curl --max-time 15 -F excelFiles=@Báo cáo doanh thu Q3.xlsx $B/upload"
  curl -s --max-time 15 -w '\nHTTP %{http_code} | %{time_total}s\n' -F "excelFiles=@$DATA/basic/Báo cáo doanh thu Q3.xlsx" $B/upload; echo "curl exit=$?"
  echo "\$ curl $B/status/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10"; curl -s --max-time 15 -w '\nHTTP %{http_code} | %{time_total}s\n' $B/status/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10
  listdirs; echo "--- log API (trích)"; grep -E 'error|"POST"|status' $LOGS/api.log | cut -c1-260 | tail -6
  echo "[$(ts)] bật lại Redis"; start_redis >/dev/null; sleep 3
  echo "\$ curl -F excelFiles=@Báo cáo doanh thu Q3.xlsx $B/upload   (sau khi bật lại Redis)"
  curl -s -w '\nHTTP %{http_code} | %{time_total}s\n' -F "excelFiles=@$DATA/basic/Báo cáo doanh thu Q3.xlsx" $B/upload; }

t17() { fresh 2; echo "\$ redis-cli config set maxmemory 1   (Redis từ chối mọi lệnh ghi)"; redis-cli config set maxmemory 1
  echo "\$ curl -F excelFiles=@Báo cáo doanh thu Q3.xlsx $B/upload"
  curl -s -w '\nHTTP %{http_code} | %{time_total}s\n' -F "excelFiles=@$DATA/basic/Báo cáo doanh thu Q3.xlsx" $B/upload
  redis-cli config set maxmemory 0 >/dev/null; listdirs; echo "--- log API (dòng lỗi)"; grep '"level":"error"' $LOGS/api.log | cut -c1-300; }

t18() { killall_node; redis-cli ping >/dev/null 2>&1 || start_redis >/dev/null; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log
  start_api RESULT_TTL_SECONDS=20; start_worker w1 RESULT_TTL_SECONDS=20 SWEEP_INTERVAL_SECONDS=5 WORKER_CONCURRENCY=2
  echo "# RESULT_TTL_SECONDS=20, SWEEP_INTERVAL_SECONDS=5"; local R ID ST R2 ID2
  R=$(upload "$DATA/basic" "Báo cáo doanh thu Q3.xlsx"); ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 1 60); echo "$ST" | tail -1
  curl -s -o /dev/null -w "[$(ts)] GET /download/<id> -> HTTP %{http_code}\n" $B/download/$ID; listdirs
  sleep 30; echo "[$(ts)] (30 giây sau, chưa có request nào khác)"
  curl -s -w "\n[$(ts)] GET /download/<id> -> HTTP %{http_code}\n" $B/download/$ID
  curl -s -w "\n[$(ts)] GET /status/<id> -> HTTP %{http_code}\n" $B/status/$ID; listdirs
  echo "[$(ts)] upload một request khác và đợi nó xong"
  R2=$(upload "$DATA/basic" "Danh sách lớp DCT01.xlsx"); ID2=$(echo "$R2" | head -1 | reqid); poll $ID2 1 60 | tail -1
  curl -s -w "\n[$(ts)] GET /status/<id cũ> -> HTTP %{http_code}\n" $B/status/$ID
  echo "--- log worker"; grep -E "SWEEP|ZIP" $LOGS/w1.log; }

t19() { fresh 2; local R ID ST U
  echo "# Tải ZIP: client ngắt giữa chừng, rồi tải lại hai lần"
  R=$(upload "$DATA/heavy10" "Nhat_ky_01.xlsx" "Nhat_ky_02.xlsx" "Nhat_ky_03.xlsx"); ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 2 90); U=$(echo "$ST" | zipurl)
  echo "\$ curl --limit-rate 20k --max-time 1 -o ngat.zip $B$U"; curl -s --limit-rate 20k --max-time 1 -o $S/tmp/t19_ngat.zip -w "HTTP %{http_code} | nhận %{size_download} B\n" "$B$U"; echo "curl exit=$?"
  sleep 1; for i in 1 2; do echo "\$ curl -o lan$i.zip $B$U"; curl -s -o $S/tmp/t19_$i.zip -w "HTTP %{http_code} | %{size_download} B\n" "$B$U"; sha256sum $S/tmp/t19_$i.zip | cut -c1-16; done
  listdirs; echo "--- log API (các dòng download)"; grep download $LOGS/api.log; }

t20() { killall_node; pkill -9 -f soffice.bin; redis-cli ping >/dev/null 2>&1 || start_redis >/dev/null; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log; start_api
  start_worker w1 CONVERT_TIMEOUT_SECONDS=15 WORKER_CONCURRENCY=1
  echo "# worker concurrency 1, CONVERT_TIMEOUT_SECONDS=15"; local R ID prev=0
  R=$(upload "$DATA/heavy" "Nhật ký bán hàng cả năm.xlsx"); echo "[$(ts)] $(echo "$R" | head -1)"; ID=$(echo "$R" | head -1 | reqid)
  for i in $(seq 1 200); do pgrep -f soffice.bin >/dev/null && break; sleep 0.1; done; sleep 0.3
  echo "[$(ts)] \$ kill -STOP \$(pgrep -f soffice.bin)   (giả lập LibreOffice treo)"; kill -STOP $(pgrep -f soffice.bin)
  for t in 10 20 30 45 60 90; do sleep $(( t - prev )); prev=$t; echo "[$(ts)] +${t}s $(curl -s $B/status/$ID)"; curl -s $B/status/$ID | grep -q '"status":"done"' && break; done
  echo "--- log worker"; cat $LOGS/w1.log; echo "--- tiến trình soffice còn lại"; ps -o pid,stat,etime,cmd -C soffice.bin | cut -c1-80; pkill -9 -f soffice.bin; }

t21() { fresh 2; local R ID
  echo "# Hai request /status cùng lúc ngay khi batch xong"
  R=$(upload "$DATA/basic" "Báo cáo doanh thu Q3.xlsx" "Danh sách lớp DCT01.xlsx" "Bảng chấm công tháng 9.xlsx"); echo "$R" | head -1; ID=$(echo "$R" | head -1 | reqid)
  echo "# đợi worker nén ZIP (không gọi /status)"; wait_log $LOGS/w1.log "ZIP:" 60
  echo "[$(ts)] \$ curl /status/<id> & curl /status/<id> &   (hai request song song)"
  curl -s -w '  -> HTTP %{http_code}\n' $B/status/$ID > $S/tmp/r1 & local p1=$!; curl -s -w '  -> HTTP %{http_code}\n' $B/status/$ID > $S/tmp/r2 & local p2=$!; wait $p1 $p2
  echo "A: $(cat $S/tmp/r1)"; echo "B: $(cat $S/tmp/r2)"; echo "--- log worker"; grep -E "ZIP" $LOGS/w1.log; listdirs; }

t22() { fresh 2; local R ID
  echo "# Không ai hỏi /status (người dùng đóng trình duyệt sau khi upload)"
  R=$(upload "$DATA/basic" "Báo cáo doanh thu Q3.xlsx" "Danh sách lớp DCT01.xlsx" "Bảng chấm công tháng 9.xlsx"); echo "[$(ts)] $(echo "$R" | head -1)"; ID=$(echo "$R" | head -1 | reqid)
  sleep 20; echo "[$(ts)] (20 giây sau, không gọi /status)"; listdirs; echo "--- log worker"; cat $LOGS/w1.log; }

t23() { killall_node; redis-cli ping >/dev/null 2>&1 || start_redis >/dev/null; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log
  start_api UPLOAD_RATE_LIMIT=3; echo "# UPLOAD_RATE_LIMIT=3 (mặc định 10 lần/15 phút/IP), không chạy worker"
  for i in 1 2 3 4; do echo "\$ curl -F excelFiles=@Báo cáo doanh thu Q3.xlsx $B/upload   (lần $i)"
    curl -s -D $S/tmp/t23_h -w '\nHTTP %{http_code}\n' -F "excelFiles=@$DATA/basic/Báo cáo doanh thu Q3.xlsx" $B/upload; done
  echo "--- header của lần 4"; tr -d '\r' < $S/tmp/t23_h | grep -iE "^ratelimit|^retry-after"; listdirs
  echo "--- log API"; grep '"POST"' $LOGS/api.log; }

t24() { fresh 2; echo "# CORS_ORIGINS để trống (mặc định)"
  echo "\$ curl -H 'Origin: http://trang-la.example' $B/status/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10"
  curl -s -D - -o /dev/null -H 'Origin: http://trang-la.example' $B/status/6f1c2a9e-3b7d-4c11-9a0e-2d5f8b7c4e10 | tr -d '\r' | grep -iE "^HTTP|access-control" || true
  echo "(không có header Access-Control-Allow-Origin)"
  stop_api; : > $LOGS/api.log; start_api CORS_ORIGINS=http://frontend.example; echo "# CORS_ORIGINS=http://frontend.example"
  for o in http://frontend.example http://trang-la.example; do echo "\$ curl -X OPTIONS -H 'Origin: $o' -H 'Access-Control-Request-Method: POST' $B/upload"
    curl -s -D - -o /dev/null -X OPTIONS -H "Origin: $o" -H 'Access-Control-Request-Method: POST' $B/upload | tr -d '\r' | grep -iE "^HTTP|access-control"; done; }

t25() { fresh 2; local R ID ST
  echo "# File 24 cột (rộng hơn khổ A4 dọc) và file 5 cột qua hệ thống"
  R=$(upload "$FX" "Bảng lương chi tiết.xlsx" "Báo cáo doanh thu Q3.xlsx"); ID=$(echo "$R" | head -1 | reqid); ST=$(poll $ID 1 90); echo "$ST" | tail -1
  rm -rf $S/tmp/t25 && mkdir -p $S/tmp/t25/he_thong $S/tmp/t25/goc && curl -s -o $S/tmp/t25/kq.zip "$B$(echo "$ST" | zipurl)" && (cd $S/tmp/t25/he_thong && unzip -q ../kq.zip)
  echo "# Đối chứng: chuyển thẳng file gốc bằng LibreOffice, không qua src/pagesetup.js"
  echo "\$ soffice --headless --convert-to pdf 'Bảng lương chi tiết.xlsx'"; (cd $S/tmp/t25/goc && cp "$FX/Bảng lương chi tiết.xlsx" in.xlsx && soffice --headless --convert-to pdf in.xlsx >/dev/null 2>&1 && mv in.pdf Bang_luong_chi_tiet.pdf)
  for f in he_thong/Bang_luong_chi_tiet.pdf he_thong/Bao_cao_doanh_thu_Q3.pdf goc/Bang_luong_chi_tiet.pdf; do
    echo "$f: $(pdfinfo $S/tmp/t25/$f | awk -F': *' '/^Pages/{p=$2} /^Page size/{s=$2} END{print p" trang, khổ "s}')"; done; }

t26() { echo "\$ npm test"; (cd $APP && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"; echo "exit code: ${PIPESTATUS[0]}")
  echo "# Thử một bản sao có ca sai: đổi mã mong đợi 413 thành 400 trong test/api.test.js"
  rm -rf $S/tmp/t26 && mkdir -p $S/tmp/t26 && cp -r $APP/src $APP/test $APP/public $APP/package.json $S/tmp/t26/ && ln -s $APP/node_modules $S/tmp/t26/node_modules
  sed -i 's/assert.equal(res.status, 413);/assert.equal(res.status, 400);/' $S/tmp/t26/test/api.test.js
  echo "\$ npm test"; (cd $S/tmp/t26 && npm test 2>&1 | grep -E "^✖ |^ℹ (tests|pass|fail)" | head -4; echo "exit code: ${PIPESTATUS[0]}"); }

t27() { fresh 2; echo "\$ npm run test:e2e"; (cd $APP && npm run --silent test:e2e; echo "exit code: $?"); }

t28() { echo "\$ npm audit"; (cd $APP && npm audit 2>&1 | tail -2); echo "\$ npm ls --depth=0"; (cd $APP && npm ls --depth=0 2>&1 | sed 1d); }

t29() { echo "# API khởi động khi Redis chưa chạy"; killall_node; stop_redis; reset_dirs; : > $LOGS/api.log
  echo "[$(ts)] \$ node server.js   (Redis đang tắt)"; (cd $APP && exec node server.js >> $LOGS/api.log 2>&1) & echo $! > $LOGS/api.pid
  sleep 3; echo "[$(ts)] \$ curl $B/   -> $(curl -s -o /dev/null -w '%{http_code}' $B/)   (000: chưa có tiến trình nào nghe cổng 3000)"
  echo "[$(ts)] bật Redis"; start_redis >/dev/null; wait_api; echo "[$(ts)] \$ curl $B/   -> $(curl -s -o /dev/null -w '%{http_code}' $B/)"
  echo "--- log API"; cat $LOGS/api.log; }

t30() { fresh 2; local P
  echo "# Redis còn chạy nhưng bị treo (kill -STOP): kết nối TCP vẫn mở, lệnh gửi đi không có trả lời"
  P=$(pgrep -x redis-server); echo "[$(ts)] \$ kill -STOP $P"; kill -STOP $P
  echo "[$(ts)] \$ curl --max-time 15 -F excelFiles=@Báo cáo doanh thu Q3.xlsx $B/upload"
  curl -s --max-time 15 -w '\nHTTP %{http_code} | %{time_total}s\n' -F "excelFiles=@$DATA/basic/Báo cáo doanh thu Q3.xlsx" $B/upload; echo "curl exit=$?"
  listdirs; echo "[$(ts)] \$ kill -CONT $P"; kill -CONT $P; sleep 12
  echo "--- log API (trích)"; grep -E '"POST"|error' $LOGS/api.log | cut -c1-200
  echo "--- log worker 12 giây sau khi Redis chạy tiếp"; cat $LOGS/w1.log | cut -c1-200; listdirs; }

t31() { fresh 2; echo "# Giao diện dưới CSP: Chromium (Playwright) mở trang, chọn 2 file, bấm nút, chờ màn hình hoàn tất"
  (cd $S/scripts && node ui_check.js $FX); echo "--- log API"; cut -c1-170 $LOGS/api.log; }

AC=$S/tools/node_modules/.bin/autocannon

p1() { # Độ trễ GET /status của một request 20 file đang chờ (không chạy worker); tắt giới hạn tần suất để đo
  killall_node; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log; start_api API_RATE_LIMIT=100000000
  local files=() R ID; for f in $DATA/batch20/*.xlsx; do files+=("$(basename $f)"); done
  R=$(upload "$DATA/batch20" "${files[@]}" 2>/dev/null); ID=$(echo "$R" | head -1 | reqid); curl -s $B/status/$ID; echo
  echo "\$ autocannon -c 10 -d 10 $B/status/<id>"; $AC -c 10 -d 10 $B/status/$ID 2>&1; }

one_run() { # one_run <số worker> <concurrency>: thời gian từ lúc upload tới khi /status = done
  local nw=$1 c=$2 i files=() t0 t1 ID r
  killall_node; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log; start_api
  for i in $(seq 1 $nw); do start_worker w$i WORKER_CONCURRENCY=$c; done
  for f in $DATA/batch20/*.xlsx; do files+=(-F "excelFiles=@$f"); done
  t0=$(date +%s.%N); ID=$(curl -s "${files[@]}" $B/upload | reqid); t1=$(date +%s.%N)
  while true; do r=$(curl -s $B/status/$ID); echo "$r" | grep -q '"status":"\(done\|error\)"' && break; sleep 0.25; done
  python3 -c "import sys; t0,t1,t2=map(float,sys.argv[1:]); print(f'{t1-t0:.3f};{t2-t0:.2f}')" $t0 $t1 $(date +%s.%N) | tr -d '\n'
  echo ";$(echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['done'], d['failed'])")"; }

p3() { echo "# 20 file tồn kho (400 dòng mỗi file) trong một request; thời gian từ lúc upload tới khi /status trả done (đã gồm nén ZIP)"
  echo "cauhinh;so_worker;concurrency;lan;upload_s;tong_s;ket_qua"
  for cfg in "1 1" "1 2" "1 4" "2 2" "2 5"; do set -- $cfg; for rep in 1 2; do echo -n "W$1C$2;$1;$2;$rep;"; one_run $1 $2; done; done; }

for t in "$@"; do echo "=== $t"; { head_info; $t; } > $EV/$t.txt 2>&1; tail -3 $EV/$t.txt; done
killall_node
