const fs = require('fs/promises');
const path = require('path');
// Multer: middleware đọc request dạng multipart/form-data (form có gửi file)
const multer = require('multer');
const config = require('./config');
const { AppError } = require('./errors');
const { decodeOriginalName } = require('./filename');

// Multer ghi file xuống đĩa theo stream; giới hạn số file, dung lượng và đuôi file
const upload = multer({
    // Thư mục lưu file tạm; Multer tự đặt tên ngẫu nhiên (không có đuôi) để không trùng và không dùng tên do người dùng gửi
    dest: config.uploadDir,
    // files: số file tối đa; fileSize: dung lượng tối đa của mỗi file (byte).
    // Vượt giới hạn thì Multer báo MulterError (LIMIT_FILE_COUNT, LIMIT_FILE_SIZE); app.js đổi thành 400 hoặc 413
    limits: { files: config.maxFiles, fileSize: config.maxFileBytes },
    // Được gọi cho TỪNG file, trước khi ghi xuống đĩa: cb(null, true) là nhận, cb(err) là từ chối cả request
    fileFilter(req, file, cb) {
        const name = decodeOriginalName(file.originalname);
        // Chỉ kiểm tra đuôi (không phân biệt hoa thường); nội dung thật được kiểm tra sau, ở checkUploadedFiles
        if (path.extname(name).toLowerCase() !== '.xlsx') {
            return cb(new AppError(400, 'INVALID_FILE_TYPE', `Chỉ nhận file .xlsx: "${name}"`));
        }
        cb(null, true);
    },
});

// File .xlsx là một file ZIP: 4 byte đầu phải là "PK\x03\x04"
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Đọc 4 byte đầu của file rồi so với chữ ký ZIP.
// Chỉ đọc 4 byte chứ không đọc cả file, nên vẫn nhanh khi file lớn.
async function hasZipSignature(filePath) {
    const fh = await fs.open(filePath, 'r');
    try {
        // fh.read(buffer nhận dữ liệu, vị trí ghi trong buffer, số byte cần đọc, vị trí bắt đầu đọc trong file)
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(4), 0, 4, 0);
        // File ngắn hơn 4 byte (VD file rỗng) thì bytesRead < 4, coi là không hợp lệ
        return bytesRead === 4 && buffer.equals(ZIP_SIGNATURE);
    } finally {
        // finally luôn chạy, kể cả khi đọc bị lỗi: luôn đóng file, không để rò file handle
        await fh.close();
    }
}

// Chạy sau Multer: có ít nhất 1 file và mọi file đúng chữ ký .xlsx
// Đây là hàm async: throw ở đây thành Promise bị reject, Express 5 tự chuyển tới middleware lỗi,
// và middleware lỗi (app.js) sẽ xóa các file Multer đã ghi xuống đĩa
async function checkUploadedFiles(req, res, next) {
    // req.files do Multer gán: mảng thông tin các file đã ghi (path, originalname, size...)
    const files = req.files || [];
    if (files.length === 0) throw new AppError(400, 'NO_FILES', 'Không có file.');

    // Gom TẤT CẢ file sai rồi báo một lần, để người dùng biết hết các file cần sửa
    const invalid = [];
    for (const file of files) {
        if (!(await hasZipSignature(file.path))) invalid.push(decodeOriginalName(file.originalname));
    }
    if (invalid.length > 0) {
        throw new AppError(400, 'INVALID_FILE_CONTENT', 'Nội dung file không phải .xlsx.', { files: invalid });
    }
    // Mọi file hợp lệ: chuyển sang handler của POST /upload
    next();
}

module.exports = {
    // Nhận nhiều file trong trường form tên "excelFiles", tối đa maxFiles file.
    // Gửi sai tên trường thì Multer báo LIMIT_UNEXPECTED_FILE (400 UNEXPECTED_FIELD)
    uploadExcel: upload.array('excelFiles', config.maxFiles),
    checkUploadedFiles,
};
