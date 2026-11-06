// memoryWatch.js
const v8 = require('node:v8');

// Hàm in ra lượng bộ nhớ heap đang dùng (đơn vị MB)
function printMemory(label) {
  const stats = v8.getHeapStatistics();
  const usedMB = (stats.used_heap_size / 1024 / 1024).toFixed(2);
  const totalMB = (stats.heap_size_limit / 1024 / 1024).toFixed(2);
  console.log(`[${label}] Đang dùng: ${usedMB} MB / Giới hạn: ${totalMB} MB`);
}

// ─── Tình huống 1: Bình thường — bộ nhớ không tăng mãi ───────
console.log('\n=== Tình huống BÌNH THƯỜNG ===');
printMemory('Trước');

for (let i = 0; i < 5; i++) {
  // Biến local — sau mỗi vòng lặp sẽ được dọn dẹp
  const temp = new Array(100000).fill(i);
  printMemory(`Vòng ${i + 1}`);
}

// ─── Tình huống 2: Memory leak — bộ nhớ tăng mãi ─────────────
console.log('\n=== Tình huống MEMORY LEAK ===');
const leakyArray = []; // Biến này nằm ngoài vòng lặp → không bao giờ bị dọn

printMemory('Trước');

for (let i = 0; i < 5; i++) {
  // Cứ mỗi vòng lặp lại nhồi thêm dữ liệu vào leakyArray
  // và không bao giờ xóa đi → đây là memory leak
  leakyArray.push(new Array(100000).fill(i));
  printMemory(`Vòng ${i + 1}`);
}