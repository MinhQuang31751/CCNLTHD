// heavyTask.js
// Giả lập một tác vụ tốn CPU: tính tổng số nguyên tố dưới 100,000
function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

function countPrimes(limit) {
  let count = 0;
  for (let i = 2; i < limit; i++) {
    if (isPrime(i)) count++;
  }
  return count;
}

console.log('Bắt đầu tính...');
const result = countPrimes(100000);
console.log(`Tìm thấy ${result} số nguyên tố`);