# Hands-on lab: lỗi bất đồng bộ, validation và thời hạn trong Express 5

Đề bài, nhiệm vụ và giải thích đáp án nằm ở Phụ lục D của báo cáo.

```bash
npm install                  # Express 5.2.1, zod 4.6.7
node starter.js              # bản cố ý còn lỗi, cổng 3300
node check.mjs               # cửa sổ khác: 1/5 ca đạt với starter
QUEUE_DOWN=1 node starter.js # giả lập hàng đợi treo
node check.mjs --down        # 0/1 ca đạt với starter
```

Sửa `starter.js` theo nhiệm vụ cho tới khi `node check.mjs` đạt 5/5 và `node check.mjs --down` đạt 1/1 (exit code 0). `solution.js` là đáp án. `ket_qua_node24.txt` là kết quả chạy starter và đáp án trên Node.js 24.22.2.
