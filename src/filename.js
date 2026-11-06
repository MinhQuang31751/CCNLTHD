const path = require('path');

// Multer đọc tên file theo latin1, đổi lại sang UTF-8 để giữ tên tiếng Việt
function decodeOriginalName(name) {
    return Buffer.from(name, 'latin1').toString('utf8');
}

// "Báo cáo v1.2.xlsx" -> "Bao_cao_v1_2": bỏ đuôi, bỏ dấu (tách dấu bằng NFD), thay ký tự lạ bằng _
function toSafeBaseName(originalName) {
    const base = path.parse(originalName).name;
    const ascii = base
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
    return ascii.replace(/[^a-zA-Z0-9]/g, '_') || 'file';
}

// Tên PDF không trùng trong một request: trùng thì thêm _2, _3 ... (không phân biệt hoa thường)
function uniquePdfNames(originalNames) {
    const used = new Set();
    return originalNames.map((name) => {
        const base = toSafeBaseName(name);
        let candidate = base;
        for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}_${n}`;
        used.add(candidate.toLowerCase());
        return `${candidate}.pdf`;
    });
}

module.exports = { decodeOriginalName, toSafeBaseName, uniquePdfNames };
