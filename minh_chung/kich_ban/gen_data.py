import sys, os, random
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
random.seed(22)
out = sys.argv[1]
thin = Side(style='thin', color='999999')
def styled_header(ws, headers):
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1F4E78')
        c.alignment = Alignment(horizontal='center'); c.border = Border(top=thin,bottom=thin,left=thin,right=thin)
def save(wb, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wb.save(path); print('created', path, os.path.getsize(path))
 
def doanh_thu(path, title):
    wb = Workbook(); ws = wb.active; ws.title = 'Doanh thu'
    styled_header(ws, ['Tháng', 'Chi nhánh', 'Doanh thu (triệu đồng)', 'Chi phí (triệu đồng)', 'Lợi nhuận'])
    r = 2
    for m in ['Tháng 7','Tháng 8','Tháng 9']:
        for cn in ['Quận 1','Quận 5','Thủ Đức']:
            dt = random.randint(300, 900); cp = random.randint(150, 400)
            ws.append([m, cn, dt, cp, f'=C{r}-D{r}']); r += 1
    ws.append(['Tổng', '', f'=SUM(C2:C{r-1})', f'=SUM(D2:D{r-1})', f'=SUM(E2:E{r-1})'])
    for c in ws[r]: c.font = Font(bold=True)
    for col, w in zip('ABCDE', [12, 14, 24, 22, 14]): ws.column_dimensions[col].width = w
    save(wb, path)
 
def danh_sach(path, n=40):
    wb = Workbook(); ws = wb.active; ws.title = 'Danh sách'
    styled_header(ws, ['STT', 'Mã SV', 'Họ và tên', 'Lớp', 'Điểm QT', 'Điểm thi', 'Tổng kết'])
    ho = ['Nguyễn','Trần','Lê','Phạm','Hoàng','Võ','Đặng','Bùi']; dem = ['Văn','Thị','Minh','Ngọc','Gia','Thanh']; ten = ['An','Bình','Châu','Dũng','Hà','Khánh','Linh','Nam','Phúc','Trang']
    for i in range(1, n+1):
        qt = round(random.uniform(5, 10), 1); thi = round(random.uniform(4, 10), 1)
        ws.append([i, f'SV{1000+i}', f'{random.choice(ho)} {random.choice(dem)} {random.choice(ten)}', 'DCT01', qt, thi, f'=ROUND(E{i+1}*0.4+F{i+1}*0.6,1)'])
    for col, w in zip('ABCDEFG', [6, 10, 24, 10, 9, 9, 10]): ws.column_dimensions[col].width = w
    save(wb, path)
 
def cham_cong(path):
    wb = Workbook(); ws = wb.active; ws.title = 'Chấm công'
    styled_header(ws, ['Nhân viên'] + [f'{d:02d}/09' for d in range(1, 16)] + ['Tổng công'])
    for k in range(12):
        row = [f'Nhân viên {k+1:02d}'] + [random.choice(['x','x','x','x','P','']) for _ in range(15)]
        ws.append(row + [f'=COUNTIF(B{k+2}:P{k+2},"x")'])
    save(wb, path)
 
def ton_kho(path, rows=300):
    wb = Workbook(); ws = wb.active; ws.title = 'Tồn kho'
    styled_header(ws, ['Mã hàng', 'Tên hàng', 'Đơn vị', 'Tồn đầu', 'Nhập', 'Xuất', 'Tồn cuối', 'Đơn giá', 'Thành tiền'])
    for i in range(rows):
        r = i + 2
        ws.append([f'MH{i:04d}', f'Sản phẩm mẫu {i}', random.choice(['Cái','Hộp','Thùng']), random.randint(0,500), random.randint(0,300), random.randint(0,300), f'=D{r}+E{r}-F{r}', random.randint(10,900)*1000, f'=G{r}*H{r}'])
    save(wb, path)
 
base = os.path.join(out, 'basic')
doanh_thu(os.path.join(base, 'Báo cáo doanh thu Q3.xlsx'), 'Q3')
danh_sach(os.path.join(base, 'Danh sách lớp DCT01.xlsx'))
cham_cong(os.path.join(base, 'Bảng chấm công tháng 9.xlsx'))
 
sp = os.path.join(out, 'special')
doanh_thu(os.path.join(sp, 'Báo cáo doanh thu Q3.xlsx'), 'Q3')
doanh_thu(os.path.join(sp, 'Bao cao doanh thu Q3.xlsx'), 'Q3 (bản khác)')
ton_kho(os.path.join(sp, 'v1.2.xlsx'), 50)
ton_kho(os.path.join(sp, 'v1.3.xlsx'), 60)
with open(os.path.join(sp, 'file_hong.xlsx'), 'w') as f: f.write('Day khong phai file Excel, chi la van ban doi duoi .xlsx\n' * 20)
with open(os.path.join(sp, 'ghi_chu.txt'), 'w') as f: f.write('file van ban thuong\n')
 
b20 = os.path.join(out, 'batch20')
for i in range(1, 21):
    ton_kho(os.path.join(b20, f'Ton_kho_chi_nhanh_{i:02d}.xlsx'), 400)

def nhat_ky(path, rows=12000):
    wb = Workbook(); ws = wb.active; ws.title = 'Nhật ký'
    styled_header(ws, ['Ngày', 'Số hóa đơn', 'Khách hàng', 'Mặt hàng', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Ghi chú'])
    kh = ['Công ty An Phát', 'Cửa hàng Bình Minh', 'Siêu thị Hòa Bình', 'Đại lý Thành Công', 'Khách lẻ']
    for i in range(rows):
        r = i + 2
        ws.append([f'{(i % 28) + 1:02d}/{(i // 1000) % 12 + 1:02d}/2026', f'HD{i:06d}', random.choice(kh), f'Sản phẩm mẫu {i % 300}', random.randint(1, 50), random.randint(10, 900) * 1000, f'=E{r}*F{r}', ''])
    for col, w in zip('ABCDEFGH', [12, 12, 22, 20, 9, 12, 14, 10]): ws.column_dimensions[col].width = w
    save(wb, path)

nhat_ky(os.path.join(out, 'heavy', 'Nhật ký bán hàng cả năm.xlsx'))
