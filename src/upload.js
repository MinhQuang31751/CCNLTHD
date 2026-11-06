const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const config = require('./config');
const { AppError } = require('./errors');
const { decodeOriginalName } = require('./filename');

// Multer ghi file xuống đĩa theo stream; giới hạn số file, dung lượng và đuôi file
const upload = multer({
    dest: config.uploadDir,
    limits: { files: config.maxFiles, fileSize: config.maxFileBytes },
    fileFilter(req, file, cb) {
        const name = decodeOriginalName(file.originalname);
        if (path.extname(name).toLowerCase() !== '.xlsx') {
            return cb(new AppError(400, 'INVALID_FILE_TYPE', `Chỉ nhận file .xlsx: "${name}"`));
        }
        cb(null, true);
    },
});

// File .xlsx là một file ZIP: 4 byte đầu phải là "PK\x03\x04"
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

async function hasZipSignature(filePath) {
    const fh = await fs.open(filePath, 'r');
    try {
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(4), 0, 4, 0);
        return bytesRead === 4 && buffer.equals(ZIP_SIGNATURE);
    } finally {
        await fh.close();
    }
}

// Chạy sau Multer: có ít nhất 1 file và mọi file đúng chữ ký .xlsx
async function checkUploadedFiles(req, res, next) {
    const files = req.files || [];
    if (files.length === 0) throw new AppError(400, 'NO_FILES', 'Không có file.');

    const invalid = [];
    for (const file of files) {
        if (!(await hasZipSignature(file.path))) invalid.push(decodeOriginalName(file.originalname));
    }
    if (invalid.length > 0) {
        throw new AppError(400, 'INVALID_FILE_CONTENT', 'Nội dung file không phải .xlsx.', { files: invalid });
    }
    next();
}

module.exports = {
    uploadExcel: upload.array('excelFiles', config.maxFiles),
    checkUploadedFiles,
};
