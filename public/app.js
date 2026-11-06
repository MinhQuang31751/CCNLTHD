// Script của giao diện, tách khỏi index.html để CSP không cần cho phép script inline (src/security.js).
// Sự kiện được gắn bằng addEventListener vì CSP chặn thuộc tính onclick="...".
const fileInput       = document.getElementById('fileInput');
const fileCountText   = document.getElementById('fileCount');
const uploadSection   = document.getElementById('uploadSection');
const statusSection   = document.getElementById('statusSection');
const loadingUI       = document.getElementById('loadingUI');
const finishUI        = document.getElementById('finishUI');
const errorUI         = document.getElementById('errorUI');
const zipBtn          = document.getElementById('zipBtn');
const progressBar     = document.getElementById('progressBar');
const progressText    = document.getElementById('progressText');
const progressDetail  = document.getElementById('progressDetail');
const finishDetail    = document.getElementById('finishDetail');
const errorMsg        = document.getElementById('errorMsg');

let pollTimer = null;

// ── Khi chọn file ──
fileInput.addEventListener('change', () => {
    const count = fileInput.files.length;
    fileCountText.innerText = count > 0 ? `Đã chọn ${count} file` : 'Chọn các file Excel (.xlsx)';
    fileCountText.classList.toggle('text-blue-400', count > 0);
});

// ── Bắt đầu upload ──
async function startProcess() {
    if (fileInput.files.length === 0) return alert('Vui lòng chọn ít nhất 1 file Excel!');

    const fd = new FormData();
    for (let f of fileInput.files) fd.append('excelFiles', f);

    showSection('status');

    try {
        const res = await fetch('/upload', { method: 'POST', body: fd });
        // Lỗi từ server luôn là JSON { code, message }: hiện đúng lý do (sai định dạng, quá nhiều file, quá tần suất...)
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Server gặp sự cố khi nhận file.');

        if (data.status === 'queued' && data.requestId) {
            // Hệ thống mới: poll status
            pollStatus(data.requestId, data.total);
        } else if (data.zipUrl) {
            // Hệ thống cũ (fallback): trả về zipUrl luôn
            showFinish(data.zipUrl, 0);
        } else {
            throw new Error('Phản hồi không hợp lệ từ server.');
        }
    } catch (err) {
        showError(err.message);
    }
}

// ── Poll /status/:requestId mỗi 2 giây ──
function pollStatus(requestId, total) {
    updateProgress(0, total, 0);

    pollTimer = setInterval(async () => {
        try {
            const res = await fetch(`/status/${requestId}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Không thể kiểm tra trạng thái.');
            console.log(`Status: ${data.status} | Percent: ${data.percent || 0}% | Done: ${data.done || 0}/${total}|data.zipUrl: ${data.zipUrl || 'N/A'}|Failed: ${data.failed || 0}`);

            if (data.status === 'processing') {
                updateProgress(data.percent || 0, data.total, data.done);
            }

            if (data.status === 'done') {
                clearInterval(pollTimer);
                showFinish(data.zipUrl, data.failed);
            }

            if (data.status === 'error') {
                clearInterval(pollTimer);
                showError(data.message || 'Lỗi không xác định.');
            }

        } catch (err) {
            clearInterval(pollTimer);
            showError(err.message);
        }
    }, 2000);
}

// ── Cập nhật progress bar ──
function updateProgress(percent, total, done) {
    progressBar.style.width = percent + '%';
    progressText.innerText = percent + '%';
    progressDetail.innerText = `Đã xong ${done} / ${total} file`;
}

// ── Hiện màn hình hoàn tất ──
function showFinish(zipUrl, failedCount) {
    loadingUI.classList.add('hidden');
    finishUI.classList.remove('hidden');
    zipBtn.href = zipUrl;

    if (failedCount > 0) {
        finishDetail.innerText = `Hoàn tất! (${failedCount} file bị lỗi, không có trong ZIP)`;
        finishDetail.classList.add('text-yellow-400');
    } else {
        finishDetail.innerText = 'Tất cả file đã được nén ZIP an toàn.';
    }
}

// ── Hiện màn hình lỗi ──
function showError(message) {
    loadingUI.classList.add('hidden');
    errorUI.classList.remove('hidden');
    errorMsg.innerText = message;
}

// ── Chuyển section ──
function showSection(name) {
    uploadSection.classList.toggle('hidden', name !== 'upload');
    statusSection.classList.toggle('hidden', name !== 'status');
    loadingUI.classList.remove('hidden');
    finishUI.classList.add('hidden');
    errorUI.classList.add('hidden');
}

// ── Reset về ban đầu ──
function resetApp() {
    clearInterval(pollTimer);
    fileInput.value = '';
    fileCountText.innerText = 'Chọn các file Excel (.xlsx)';
    fileCountText.classList.remove('text-blue-400');
    progressBar.style.width = '0%';
    progressText.innerText = '0%';
    progressDetail.innerText = '';
    finishDetail.classList.remove('text-yellow-400');
    showSection('upload');
}

// ── Gắn sự kiện cho các nút ──
document.getElementById('startBtn').addEventListener('click', startProcess);
document.querySelectorAll('[data-action="reset"]').forEach((btn) => btn.addEventListener('click', resetApp));
