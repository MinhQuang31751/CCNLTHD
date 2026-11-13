const AdmZip = require('adm-zip');

// Sửa thiết lập in của từng sheet trước khi LibreOffice xuất PDF, để không cột nào bị đẩy sang trang sau:
// mọi cột vừa một trang theo chiều ngang (thu nhỏ khi cần), chiều dọc vẫn sang trang bình thường,
// sheet rộng hơn khổ giấy dọc thì xoay ngang.
// Cách làm: file .xlsx thực chất là một file ZIP chứa nhiều file XML, mỗi sheet là một file
// xl/worksheets/sheetN.xml. Code mở ZIP, sửa XML của từng sheet bằng biểu thức chính quy rồi đóng gói lại.

// Đường dẫn file XML của một sheet bên trong ZIP, VD "xl/worksheets/sheet1.xml"
const SHEET_PATH = /^xl\/worksheets\/[^/]+\.xml$/;
const PAPER_WIDTH_INCH = { 1: 8.5, 5: 8.5, 8: 11.69, 9: 8.27 }; // khổ dọc: Letter, Legal, A3, A4; không rõ thì coi là A4
const DEFAULT_COL_WIDTH = 9.140625; // độ rộng cột mặc định của Excel (8.43 ký tự + phần đệm)
const INCH_PER_COL_UNIT = 7 / 96;   // 1 đơn vị độ rộng cột ≈ 7px (chữ số Calibri 11), 96px = 1 inch

// Đổi tên cột dạng chữ sang số thứ tự: "A" -> 1, "Z" -> 26, "AA" -> 27, "AB" -> 28 (giống hệ cơ số 26)
const colNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
// Lấy giá trị một thuộc tính trong thẻ XML. VD: getAttr('<col min="1" width="20"/>', 'width') -> "20"
// Thẻ không tồn tại (undefined) hoặc thẻ không có thuộc tính đó thì trả undefined
const getAttr = (tag, name) => tag?.match(new RegExp(`\\s${name}=["']([^"']*)["']`))?.[1];
// Trong XML của Excel, giá trị đúng viết là "1" hoặc "true"
const isTrue = (value) => value === '1' || value === 'true';

// Đặt giá trị thuộc tính trong một thẻ: có rồi thì thay, chưa có thì thêm vào cuối thẻ
// VD: setAttrs('<pageSetup paperSize="9"/>', { orientation: 'landscape' })
//     -> '<pageSetup paperSize="9" orientation="landscape"/>'
function setAttrs(tag, attrs) {
    for (const [name, value] of Object.entries(attrs)) {
        // Tìm thuộc tính đang có trong thẻ, giá trị nằm trong nháy kép hoặc nháy đơn
        const re = new RegExp(`\\s${name}=("[^"]*"|'[^']*')`);
        // Có thì thay giá trị; chưa có thì chèn ngay trước "/>" hoặc ">" ở cuối thẻ
        tag = re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
    }
    return tag;
}

// Bề rộng (inch) từ cột A tới cột cuối có dữ liệu; cột cuối lấy từ <dimension ref="A1:AB300"> và địa chỉ các ô
// p: tiền tố namespace của các thẻ (thường là chuỗi rỗng, có file dùng "x:")
function contentWidthInches(xml, p) {
    // Cột cuối theo <dimension ref="A1:AB300"> (lấy phần "AB"), rồi so thêm với địa chỉ từng ô <c r="AC5">
    let lastCol = colNumber(xml.match(new RegExp(`<${p}dimension\\b[^>]*\\sref="(?:[A-Z]+\\d+:)?([A-Z]+)`))?.[1] ?? '');
    for (const m of xml.matchAll(new RegExp(`<${p}c\\b[^>]*\\sr="([A-Z]+)\\d+"`, 'g'))) lastCol = Math.max(lastCol, colNumber(m[1]));

    // Độ rộng cột mặc định của sheet nếu file có đặt, không có thì dùng mặc định của Excel
    const formatPr = xml.match(new RegExp(`<${p}sheetFormatPr\\b[^>]*>`))?.[0];
    const defWidth = Number(getAttr(formatPr, 'defaultColWidth')) || DEFAULT_COL_WIDTH;
    // widths[i] = độ rộng của cột thứ i (bỏ trống ô 0 để chỉ số khớp với số thứ tự cột)
    const widths = new Array(lastCol + 1).fill(defWidth);
    // Thẻ <col min="2" max="5" width="20"/> đặt độ rộng cho các cột từ 2 tới 5; cột bị ẩn tính là 0
    for (const [col] of xml.matchAll(new RegExp(`<${p}col\\b[^>]*>`, 'g'))) {
        const width = isTrue(getAttr(col, 'hidden')) ? 0 : Number(getAttr(col, 'width') ?? defWidth);
        const max = Math.min(Number(getAttr(col, 'max')), lastCol);
        for (let i = Number(getAttr(col, 'min')); i <= max; i++) widths[i] = width;
    }
    // Cộng độ rộng các cột (bỏ ô 0) rồi đổi sang inch
    return widths.slice(1).reduce((sum, w) => sum + w, 0) * INCH_PER_COL_UNIT;
}

// Sửa XML của MỘT sheet và trả về XML mới. Gồm 3 bước: quyết định xoay ngang, bật "vừa trang", đặt pageSetup
function fitSheetXml(xml) {
    const p = xml.match(/<(\w+:)?worksheet\b/)?.[1] ?? ''; // tiền tố namespace, ví dụ "x:"
    // Tạo biểu thức chính quy tìm thẻ mở <tên ...>, có tính tiền tố namespace
    const tagRe = (name) => new RegExp(`<${p}${name}\\b[^>]*>`);

    // Custom view có pageSetup/pageMargins riêng, LibreOffice không dùng khi xuất PDF: bỏ để chỉ sửa thiết lập chính
    xml = xml.replace(new RegExp(`<${p}customSheetViews\\b[\\s\\S]*?</${p}customSheetViews>`), '');

    // Bước 1: quyết định có xoay ngang không.
    // Bề rộng in được = bề rộng khổ giấy dọc - lề trái - lề phải (không có lề thì mặc định 0.7 inch mỗi bên)
    const pageSetup = xml.match(tagRe('pageSetup'))?.[0];
    const margins = xml.match(tagRe('pageMargins'))?.[0];
    const paperWidth = PAPER_WIDTH_INCH[getAttr(pageSetup, 'paperSize')] ?? PAPER_WIDTH_INCH[9];
    const printableWidth = paperWidth - Number(getAttr(margins, 'left') ?? 0.7) - Number(getAttr(margins, 'right') ?? 0.7);
    // Nội dung rộng hơn phần in được của khổ dọc thì xoay ngang
    const landscape = contentWidthInches(xml, p) > printableWidth;

    // <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>: in theo "vừa N trang" thay cho tỉ lệ cố định
    // Bước 2: bật fitToPage. Có 4 trường hợp, tùy file đã có sẵn thẻ nào:
    //   - đã có <pageSetUpPr>: chỉ đặt fitToPage="1"
    //   - chưa có <sheetPr>: thêm <sheetPr><pageSetUpPr .../></sheetPr> ngay sau thẻ mở <worksheet>
    //   - có <sheetPr/> tự đóng: mở thành <sheetPr>...</sheetPr> rồi chèn vào giữa
    //   - có <sheetPr>...</sheetPr>: chèn ngay trước thẻ đóng </sheetPr>
    const setUpPr = xml.match(tagRe('pageSetUpPr'))?.[0];
    const alreadyFit = isTrue(getAttr(setUpPr, 'fitToPage'));
    const newSetUpPr = `<${p}pageSetUpPr fitToPage="1"/>`;
    const sheetPr = xml.match(tagRe('sheetPr'))?.[0];
    if (setUpPr) xml = xml.replace(setUpPr, () => setAttrs(setUpPr, { fitToPage: 1 }));
    else if (!sheetPr) xml = xml.replace(tagRe('worksheet'), (m) => `${m}<${p}sheetPr>${newSetUpPr}</${p}sheetPr>`);
    else if (sheetPr.endsWith('/>')) xml = xml.replace(sheetPr, () => `${sheetPr.slice(0, -2)}>${newSetUpPr}</${p}sheetPr>`);
    else xml = xml.replace(`</${p}sheetPr>`, (m) => newSetUpPr + m);

    // Bước 3: đặt các thuộc tính in trong <pageSetup>.
    // Rộng 1 trang; cao không giới hạn (0), trừ khi file đã tự đặt "vừa N trang" thì giữ số trang dọc của file
    const attrs = { fitToWidth: 1, ...(alreadyFit ? {} : { fitToHeight: 0 }), ...(landscape ? { orientation: 'landscape' } : {}) };
    // Sheet không có pageSetup thì LibreOffice in khổ A4; thẻ mới thiếu paperSize sẽ bị hiểu là Letter
    const newPageSetup = setAttrs(`<${p}pageSetup/>`, { paperSize: 9, ...attrs });
    // Đã có <pageSetup> thì sửa thuộc tính; chưa có thì thêm thẻ mới ngay sau <pageMargins>
    // (đúng thứ tự thẻ mà định dạng .xlsx yêu cầu); không có cả hai thì thêm trước </worksheet>
    if (pageSetup) xml = xml.replace(pageSetup, () => setAttrs(pageSetup, attrs));
    else if (margins) xml = xml.replace(margins, (m) => m + newPageSetup);
    else xml = xml.replace(`</${p}worksheet>`, (m) => newPageSetup + m);

    // Ngắt trang thủ công theo cột cũng tách cột sang trang khác: bỏ
    return xml.replace(new RegExp(`<${p}colBreaks\\b[^>]*/>|<${p}colBreaks\\b[\\s\\S]*?</${p}colBreaks>`), '');
}

// Nhận buffer .xlsx, trả buffer .xlsx đã sửa thiết lập in của mọi worksheet
// (worker-service.js gọi hàm này trước khi đưa file cho LibreOffice)
function fitColumnsToPage(xlsxBuffer) {
    // Mở file .xlsx (thực chất là ZIP) ngay trong bộ nhớ, không ghi ra đĩa
    const zip = new AdmZip(xlsxBuffer);
    for (const entry of zip.getEntries()) {
        // Chỉ sửa file XML của các sheet; phần còn lại (dữ liệu dùng chung, định dạng, hình ảnh...) giữ nguyên
        if (SHEET_PATH.test(entry.entryName)) {
            zip.updateFile(entry, Buffer.from(fitSheetXml(entry.getData().toString('utf8')), 'utf8'));
        }
    }
    // Đóng gói lại thành buffer .xlsx
    return zip.toBuffer();
}

// fitSheetXml được xuất ra để test riêng từng trường hợp XML (test/pagesetup.test.js)
module.exports = { fitColumnsToPage, fitSheetXml };
