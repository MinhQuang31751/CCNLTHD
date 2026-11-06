#!/bin/bash
# Mốc so sánh: đo phiên bản đầu (server.js, worker-service.js gốc) trên cùng máy, cùng ngày với bản cuối.
# Dùng: bash p3_v1.sh  — ghi vào evidence/final/p3_phien_ban_dau.txt
source "$(dirname "$0")/final_env.sh"
APP=$S/v1/app
head_info() { echo "# $(date '+%d/%m/%Y %H:%M:%S %Z') | $(node -v) | $(redis-server --version | cut -d' ' -f3) | $(soffice --version | cut -d' ' -f1-2) | $(. /etc/os-release; echo $PRETTY_NAME), $(nproc) vCPU | mã: phiên bản đầu"; }

one_run() {
  local nw=$1 c=$2 i files=() t0 t1 ID r
  killall_node; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log; start_api
  for i in $(seq 1 $nw); do start_worker w$i WORKER_CONCURRENCY=$c; done
  for f in $DATA/batch20/*.xlsx; do files+=(-F "excelFiles=@$f"); done
  t0=$(date +%s.%N); ID=$(curl -s "${files[@]}" $B/upload | reqid); t1=$(date +%s.%N)
  while true; do r=$(curl -s $B/status/$ID); echo "$r" | grep -q '"status":"\(done\|error\)"' && break; sleep 0.25; done
  python3 -c "import sys; t0,t1,t2=map(float,sys.argv[1:]); print(f'{t1-t0:.3f};{t2-t0:.2f}')" $t0 $t1 $(date +%s.%N) | tr -d '\n'
  echo ";$(echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['done'], d['failed'])")"; }

{
  head_info
  echo "# 20 file tồn kho (400 dòng mỗi file) trong một request; thời gian từ lúc upload tới khi /status trả done (đã gồm nén ZIP)"
  echo "cauhinh;so_worker;concurrency;lan;upload_s;tong_s;ket_qua"
  for cfg in "1 1" "1 2"; do set -- $cfg; for rep in 1 2; do echo -n "W$1C$2;$1;$2;$rep;"; one_run $1 $2; done; done
} > $EV/p3_phien_ban_dau.txt 2>&1
killall_node
