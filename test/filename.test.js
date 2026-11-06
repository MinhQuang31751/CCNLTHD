const test = require('node:test');
const assert = require('node:assert/strict');
const { toSafeBaseName, uniquePdfNames } = require('../src/filename');

test('bỏ dấu tiếng Việt, kể cả chữ hoa Ỵ', () => {
    assert.equal(toSafeBaseName('Báo cáo doanh thu Q3.xlsx'), 'Bao_cao_doanh_thu_Q3');
    assert.equal(toSafeBaseName('ĐỖ THỊ MỸ Ỵ.xlsx'), 'DO_THI_MY_Y');
});

test('chỉ bỏ đuôi cuối cùng, không cắt ở dấu chấm đầu tiên', () => {
    assert.equal(toSafeBaseName('v1.2.xlsx'), 'v1_2');
    assert.equal(toSafeBaseName('v1.3.xlsx'), 'v1_3');
});

test('tên trùng sau khi chuẩn hóa được thêm hậu tố, không phân biệt hoa thường', () => {
    const names = ['Báo cáo doanh thu Q3.xlsx', 'Bao cao doanh thu Q3.xlsx', 'BAO CAO DOANH THU Q3.xlsx', 'v1.2.xlsx', 'v1.3.xlsx'];
    assert.deepEqual(uniquePdfNames(names), [
        'Bao_cao_doanh_thu_Q3.pdf',
        'Bao_cao_doanh_thu_Q3_2.pdf',
        'BAO_CAO_DOANH_THU_Q3_3.pdf',
        'v1_2.pdf',
        'v1_3.pdf',
    ]);
});
