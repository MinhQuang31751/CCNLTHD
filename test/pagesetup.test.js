const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { fitColumnsToPage, fitSheetXml } = require('../src/pagesetup');

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const MARGINS = '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
const sheet = (lastCell, { before = '', after = MARGINS, cols = '' } = {}) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}>${before}<dimension ref="A1:${lastCell}"/>${cols}<sheetData/>${after}</worksheet>`;
const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>`))?.[0];

test('sheet 25 cột không có pageSetup: thêm pageSetup khổ A4, xoay ngang, rộng 1 trang, cao không giới hạn', () => {
    const out = fitSheetXml(sheet('Y60'));
    assert.match(out, /<worksheet [^>]*><sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr><dimension/);
    assert.equal(tag(out, 'pageSetup'), '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0" orientation="landscape"/>');
    assert.ok(out.indexOf('<pageSetup') > out.indexOf('<pageMargins'), 'pageSetup phải đứng sau pageMargins');
});

test('sheet 3 cột: vẫn vừa 1 trang ngang nhưng không xoay ngang', () => {
    const out = fitSheetXml(sheet('C20'));
    assert.equal(tag(out, 'pageSetup'), '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0"/>');
});

test('tính theo độ rộng cột thật: 5 cột rộng thì xoay ngang, ẩn đi thì không', () => {
    assert.match(fitSheetXml(sheet('E10', { cols: '<cols><col min="1" max="5" width="40" customWidth="1"/></cols>' })), /orientation="landscape"/);
    assert.doesNotMatch(fitSheetXml(sheet('E10', { cols: '<cols><col min="1" max="5" width="40" hidden="1"/></cols>' })), /orientation/);
});

test('file kiểu Excel: sửa pageSetup có sẵn, giữ r:id, thêm pageSetUpPr sau tabColor, bỏ colBreaks', () => {
    const out = fitSheetXml(sheet('N40', {
        before: '<sheetPr><tabColor rgb="FFFF0000"/></sheetPr>',
        cols: '<cols><col min="1" max="14" width="16" customWidth="1"/></cols>',
        after: `${MARGINS}<pageSetup paperSize="9" orientation="portrait" fitToWidth="2" r:id="rId1"/><colBreaks count="1" manualBreakCount="1"><brk id="5" max="1048575" man="1"/></colBreaks>`,
    }));
    assert.match(out, /<sheetPr><tabColor rgb="FFFF0000"\/><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
    assert.equal(tag(out, 'pageSetup'), '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" r:id="rId1" fitToHeight="0"/>');
    assert.doesNotMatch(out, /colBreaks|<brk/);
});

test('file đã đặt "vừa N trang": giữ số trang dọc của file, chỉ ép rộng 1 trang', () => {
    const out = fitSheetXml(sheet('C5', {
        before: '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
        after: `${MARGINS}<pageSetup fitToWidth="3" fitToHeight="2"/>`,
    }));
    assert.equal(tag(out, 'pageSetup'), '<pageSetup fitToWidth="1" fitToHeight="2"/>');
    assert.equal(out.match(/<pageSetUpPr/g).length, 1);
});

test('chỉ sửa thiết lập chính của sheet, không sửa pageSetup trong custom view', () => {
    const view = '<customSheetViews><customSheetView guid="{1}"><pageMargins left="1" right="1" top="1" bottom="1" header="0" footer="0"/><pageSetup orientation="portrait"/></customSheetView></customSheetViews>';
    const out = fitSheetXml(sheet('Y5', { cols: '', after: `${view}${MARGINS}` }));
    assert.doesNotMatch(out, /customSheetView/);
    assert.equal(tag(out, 'pageSetup'), '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0" orientation="landscape"/>');
});

test('sheet dùng tiền tố namespace x:', () => {
    const out = fitSheetXml('<x:worksheet xmlns:x="ns"><x:sheetPr/><x:dimension ref="A1:Z9"/><x:sheetData/><x:pageMargins left="0.7" right="0.7"/></x:worksheet>');
    assert.match(out, /<x:sheetPr><x:pageSetUpPr fitToPage="1"\/><\/x:sheetPr>/);
    assert.match(out, /<x:pageMargins [^>]*\/><x:pageSetup paperSize="9" fitToWidth="1" fitToHeight="0" orientation="landscape"\/><\/x:worksheet>/);
});

test('fitColumnsToPage: sửa mọi worksheet trong file .xlsx, phần khác giữ nguyên', () => {
    const zip = new AdmZip();
    zip.addFile('xl/workbook.xml', Buffer.from('<workbook/>'));
    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheet('Y60')));
    zip.addFile('xl/worksheets/sheet2.xml', Buffer.from(sheet('B2')));
    const out = new AdmZip(fitColumnsToPage(zip.toBuffer()));
    const read = (name) => out.getEntry(name).getData().toString('utf8');
    assert.equal(read('xl/workbook.xml'), '<workbook/>');
    assert.match(read('xl/worksheets/sheet1.xml'), /orientation="landscape"/);
    assert.match(read('xl/worksheets/sheet2.xml'), /<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0"\/>/);
});
