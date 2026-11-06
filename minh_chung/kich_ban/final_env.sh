# Môi trường chạy kiểm thử bản cuối: source final_env.sh
S=/tmp/claude-0/-home-claude/60d20ac7-98d3-55d0-b899-f90ffd9f1e2d/scratchpad
APP=$S/final/app
LOGS=$S/run/final_logs
EV=$S/evidence/final
DATA=$S/data
FX=$APP/test/fixtures
B=http://localhost:3000
mkdir -p $LOGS $EV $S/run/redis $S/tmp
export PATH=$S/node24/node_modules/node-linux-x64/bin:$PATH
export TZ=Asia/Ho_Chi_Minh LANG=C.UTF-8 LC_ALL=C.UTF-8

ts() { date +%H:%M:%S.%3N; }
start_redis() { redis-server --port 6379 --daemonize yes --dir $S/run/redis --logfile $LOGS/redis.log --save '' --appendonly no; sleep 0.5; redis-cli ping; }
stop_redis() { redis-cli shutdown nosave 2>/dev/null; sleep 0.5; }
wait_api() { local i; for i in $(seq 1 100); do (echo > /dev/tcp/127.0.0.1/3000) 2>/dev/null && return 0; sleep 0.1; done; return 1; }
# start_api [BIẾN=giá_trị ...]
start_api() { (cd $APP && exec env "$@" node server.js >> $LOGS/api.log 2>&1) & echo $! > $LOGS/api.pid; wait_api; }
stop_api() { kill $(cat $LOGS/api.pid) 2>/dev/null; sleep 0.5; }
# start_worker <tên> [BIẾN=giá_trị ...]
start_worker() { local name=$1; shift; (cd $APP && exec env "$@" node worker-service.js > $LOGS/$name.log 2>&1) & echo $! > $LOGS/$name.pid; sleep 1.5; }
killall_node() { pkill -f "node (server|worker-service)\.js"; sleep 1; }
reset_dirs() { rm -rf $APP/uploads $APP/output; mkdir -p $APP/uploads $APP/output; }
# fresh [concurrency]: dừng hết, xóa Redis và thư mục tạm, chạy API + 1 worker
fresh() { killall_node; pkill -9 -f soffice.bin 2>/dev/null; redis-cli ping >/dev/null 2>&1 || start_redis >/dev/null
  redis-cli config set maxmemory 0 >/dev/null; redis-cli flushall >/dev/null; reset_dirs; : > $LOGS/api.log
  start_api; start_worker w1 WORKER_CONCURRENCY=${1:-2}; }
# poll <requestId> [giây] [số lần]: hỏi /status tới khi done/error
poll() { local id=$1 iv=${2:-1} mx=${3:-120} i r; for i in $(seq 1 $mx); do r=$(curl -s $B/status/$id); echo "[$(ts)] $r"; echo "$r" | grep -q '"status":"\(done\|error\)"' && return 0; sleep $iv; done; return 1; }
reqid() { python3 -c "import sys,json; print(json.loads(sys.stdin.readline())['requestId'])"; }
zipurl() { python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip().splitlines()[-1].split('] ',1)[1])['zipUrl'])"; }
wait_log() { local f=$1 pat=$2 mx=${3:-60} i; for i in $(seq 1 $((mx*10))); do grep -q "$pat" $f 2>/dev/null && return 0; sleep 0.1; done; return 1; }
listdirs() { echo "\$ ls uploads/ output/"; (cd $APP && echo "uploads: $(ls uploads | wc -l) file"; echo "output: $(find output -mindepth 1 | sed 's#^output/##' | sort | tr '\n' ' ')"); }
# upload <thư mục> <file>...: in JSON, mã HTTP và thời gian
upload() { local d=$1; shift; local args=(); for f in "$@"; do args+=(-F "excelFiles=@$d/$f"); done
  echo "[$(ts)] \$ curl $(printf -- '-F "excelFiles=@%s" ' "$@")$B/upload" >&2
  curl -s -w '\nHTTP %{http_code} | %{time_total}s\n' "${args[@]}" $B/upload; }
