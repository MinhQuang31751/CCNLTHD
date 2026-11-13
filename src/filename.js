const path = require('path');

// Multer đọc tên file theo latin1, đổi lại sang UTF-8 để giữ tên tiếng Việt
// VD: trình duyệt gửi "Báo cáo.xlsx" (UTF-8) nhưng Multer đọc thành "BÃ¡o cÃ¡o.xlsx";
// lấy lại các byte gốc theo latin1 rồi đọc lại theo UTF-8 thì được "Báo cáo.xlsx"
function decodeOriginalName(name) {
    return Buffer.from(name, 'latin1').toString('utf8');
}

// "Báo cáo v1.2.xlsx" -> "Bao_cao_v1_2": bỏ đuôi, bỏ dấu (tách dấu bằng NFD), thay ký tự lạ bằng _
function toSafeBaseName(originalName) {
    // path.parse("Báo cáo v1.2.xlsx").name = "Báo cáo v1.2": chỉ bỏ đuôi cuối cùng (.xlsx)
    const base = path.parse(originalName).name;
    // Bỏ dấu tiếng Việt qua 4 bước:
    //   1. normalize('NFD'): tách chữ có dấu thành chữ gốc + ký tự dấu riêng, VD "á" -> "a" + dấu sắc
    //   2. xóa các ký tự dấu (nằm trong khoảng Unicode U+0300 đến U+036F)
    //   3, 4. "đ" và "Đ" không tách được bằng NFD nên phải thay thủ công
    const ascii = base
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
    // Ký tự không phải chữ cái hoặc chữ số (khoảng trắng, dấu chấm, ngoặc...) đổi thành "_";
    // kết quả rỗng thì dùng tên "file"
    return ascii.replace(/[^a-zA-Z0-9]/g, '_') || 'file';
}

// Tên PDF không trùng trong một request: trùng thì thêm _2, _3 ... (không phân biệt hoa thường)
// VD: ["Báo cáo.xlsx", "bao cao.xlsx"] -> ["Bao_cao.pdf", "bao_cao_2.pdf"]
function uniquePdfNames(originalNames) {
    // Tập các tên đã dùng, lưu dạng chữ thường để so sánh không phân biệt hoa thường
    const used = new Set();
    // map giữ nguyên thứ tự: tên PDF thứ i ứng với file Excel thứ i
    return originalNames.map((name) => {
        const base = toSafeBaseName(name);
        let candidate = base;
        // Tên đã có thì thử base_2, base_3... cho tới khi gặp tên chưa dùng
        for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}_${n}`;
        used.add(candidate.toLowerCase());
        return `${candidate}.pdf`;
    });
}

// upload.js và service.js dùng decodeOriginalName, uniquePdfNames; toSafeBaseName xuất thêm để test riêng
module.exports = { decodeOriginalName, toSafeBaseName, uniquePdfNames };
