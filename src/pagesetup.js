const AdmZip = require('adm-zip');

// Sửa thiết lập in của từng sheet trước khi LibreOffice xuất PDF, để không cột nào bị đẩy sang trang sau:
// mọi cột vừa một trang theo chiều ngang (thu nhỏ khi cần), chiều dọc vẫn sang trang bình thường,
// sheet rộng hơn khổ giấy dọc thì xoay ngang.

const SHEET_PATH = /^xl\/worksheets\/[^/]+\.xml$/;
const PAPER_WIDTH_INCH = { 1: 8.5, 5: 8.5, 8: 11.69, 9: 8.27 }; // khổ dọc: Letter, Legal, A3, A4; không rõ thì coi là A4
const DEFAULT_COL_WIDTH = 9.140625; // độ rộng cột mặc định của Excel (8.43 ký tự + phần đệm)
const INCH_PER_COL_UNIT = 7 / 96;   // 1 đơn vị độ rộng cột ≈ 7px (chữ số Calibri 11), 96px = 1 inch

const colNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const getAttr = (tag, name) => tag?.match(new RegExp(`\\s${name}=["']([^"']*)["']`))?.[1];
const isTrue = (value) => value === '1' || value === 'true';

// Đặt giá trị thuộc tính trong một thẻ: có rồi thì thay, chưa có thì thêm vào cuối thẻ
function setAttrs(tag, attrs) {
    for (const [name, value] of Object.entries(attrs)) {
        const re = new RegExp(`\\s${name}=("[^"]*"|'[^']*')`);
        tag = re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
    }
    return tag;
}

// Bề rộng (inch) từ cột A tới cột cuối có dữ liệu; cột cuối lấy từ <dimension ref="A1:AB300"> và địa chỉ các ô
function contentWidthInches(xml, p) {
    let lastCol = colNumber(xml.match(new RegExp(`<${p}dimension\\b[^>]*\\sref="(?:[A-Z]+\\d+:)?([A-Z]+)`))?.[1] ?? '');
    for (const m of xml.matchAll(new RegExp(`<${p}c\\b[^>]*\\sr="([A-Z]+)\\d+"`, 'g'))) lastCol = Math.max(lastCol, colNumber(m[1]));

    const formatPr = xml.match(new RegExp(`<${p}sheetFormatPr\\b[^>]*>`))?.[0];
    const defWidth = Number(getAttr(formatPr, 'defaultColWidth')) || DEFAULT_COL_WIDTH;
    const widths = new Array(lastCol + 1).fill(defWidth);
    for (const [col] of xml.matchAll(new RegExp(`<${p}col\\b[^>]*>`, 'g'))) {
        const width = isTrue(getAttr(col, 'hidden')) ? 0 : Number(getAttr(col, 'width') ?? defWidth);
        const max = Math.min(Number(getAttr(col, 'max')), lastCol);
        for (let i = Number(getAttr(col, 'min')); i <= max; i++) widths[i] = width;
    }
    return widths.slice(1).reduce((sum, w) => sum + w, 0) * INCH_PER_COL_UNIT;
}

function fitSheetXml(xml) {
    const p = xml.match(/<(\w+:)?worksheet\b/)?.[1] ?? ''; // tiền tố namespace, ví dụ "x:"
    const tagRe = (name) => new RegExp(`<${p}${name}\\b[^>]*>`);

    // Custom view có pageSetup/pageMargins riêng, LibreOffice không dùng khi xuất PDF: bỏ để chỉ sửa thiết lập chính
    xml = xml.replace(new RegExp(`<${p}customSheetViews\\b[\\s\\S]*?</${p}customSheetViews>`), '');

    const pageSetup = xml.match(tagRe('pageSetup'))?.[0];
    const margins = xml.match(tagRe('pageMargins'))?.[0];
    const paperWidth = PAPER_WIDTH_INCH[getAttr(pageSetup, 'paperSize')] ?? PAPER_WIDTH_INCH[9];
    const printableWidth = paperWidth - Number(getAttr(margins, 'left') ?? 0.7) - Number(getAttr(margins, 'right') ?? 0.7);
    const landscape = contentWidthInches(xml, p) > printableWidth;

    // <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>: in theo "vừa N trang" thay cho tỉ lệ cố định
    const setUpPr = xml.match(tagRe('pageSetUpPr'))?.[0];
    const alreadyFit = isTrue(getAttr(setUpPr, 'fitToPage'));
    const newSetUpPr = `<${p}pageSetUpPr fitToPage="1"/>`;
    const sheetPr = xml.match(tagRe('sheetPr'))?.[0];
    if (setUpPr) xml = xml.replace(setUpPr, () => setAttrs(setUpPr, { fitToPage: 1 }));
    else if (!sheetPr) xml = xml.replace(tagRe('worksheet'), (m) => `${m}<${p}sheetPr>${newSetUpPr}</${p}sheetPr>`);
    else if (sheetPr.endsWith('/>')) xml = xml.replace(sheetPr, () => `${sheetPr.slice(0, -2)}>${newSetUpPr}</${p}sheetPr>`);
    else xml = xml.replace(`</${p}sheetPr>`, (m) => newSetUpPr + m);

    // Rộng 1 trang; cao không giới hạn (0), trừ khi file đã tự đặt "vừa N trang" thì giữ số trang dọc của file
    const attrs = { fitToWidth: 1, ...(alreadyFit ? {} : { fitToHeight: 0 }), ...(landscape ? { orientation: 'landscape' } : {}) };
    // Sheet không có pageSetup thì LibreOffice in khổ A4; thẻ mới thiếu paperSize sẽ bị hiểu là Letter
    const newPageSetup = setAttrs(`<${p}pageSetup/>`, { paperSize: 9, ...attrs });
    if (pageSetup) xml = xml.replace(pageSetup, () => setAttrs(pageSetup, attrs));
    else if (margins) xml = xml.replace(margins, (m) => m + newPageSetup);
    else xml = xml.replace(`</${p}worksheet>`, (m) => newPageSetup + m);

    // Ngắt trang thủ công theo cột cũng tách cột sang trang khác: bỏ
    return xml.replace(new RegExp(`<${p}colBreaks\\b[^>]*/>|<${p}colBreaks\\b[\\s\\S]*?</${p}colBreaks>`), '');
}

// Nhận buffer .xlsx, trả buffer .xlsx đã sửa thiết lập in của mọi worksheet
function fitColumnsToPage(xlsxBuffer) {
    const zip = new AdmZip(xlsxBuffer);
    for (const entry of zip.getEntries()) {
        if (SHEET_PATH.test(entry.entryName)) {
            zip.updateFile(entry, Buffer.from(fitSheetXml(entry.getData().toString('utf8')), 'utf8'));
        }
    }
    return zip.toBuffer();
}

module.exports = { fitColumnsToPage, fitSheetXml };
