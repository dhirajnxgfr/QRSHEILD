// ============================================================
//  QR SHIELD — script.js  (updated: live camera scanning)
//  Features: Gallery upload | Paste URL | Live Camera Scan
// ============================================================

const BACKEND_URL     = 'https://qr-shield-backend.onrender.com'; // ← your Render URL
const QRSHIELD_SECRET = 'your-secret-here';                        // ← your secret

// ── DOM refs ─────────────────────────────────────────────────
const tabs          = document.querySelectorAll('.tab-btn');
const panels        = document.querySelectorAll('.tab-panel');

const fileInput     = document.getElementById('file-input');
const fileDropzone  = document.getElementById('file-dropzone');
const urlInput      = document.getElementById('url-input');
const urlScanBtn    = document.getElementById('url-scan-btn');

// Camera elements (add these to your index.html — see instructions)
const cameraPanel   = document.getElementById('camera-panel');
const videoEl       = document.getElementById('camera-video');
const canvasEl      = document.getElementById('camera-canvas');
const startCamBtn   = document.getElementById('start-camera-btn');
const stopCamBtn    = document.getElementById('stop-camera-btn');
const cameraStatus  = document.getElementById('camera-status');
const switchCamBtn  = document.getElementById('switch-camera-btn');

const resultBox     = document.getElementById('result-box');
const scanAgainBtn  = document.getElementById('scan-again-btn');

// ── State ─────────────────────────────────────────────────────
let cameraStream    = null;
let scanLoopId      = null;
let facingMode      = 'environment'; // back camera default
let isScanning      = false;

// ── Tab switching ─────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');

    // Stop camera if switching away from camera tab
    if (tab.dataset.panel !== 'camera-panel') stopCamera();
  });
});

// ── Gallery / File Upload ─────────────────────────────────────
fileDropzone?.addEventListener('click', () => fileInput.click());

fileDropzone?.addEventListener('dragover', e => {
  e.preventDefault();
  fileDropzone.classList.add('drag-over');
});

fileDropzone?.addEventListener('dragleave', () => {
  fileDropzone.classList.remove('drag-over');
});

fileDropzone?.addEventListener('drop', e => {
  e.preventDefault();
  fileDropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

fileInput?.addEventListener('change', e => {
  if (e.target.files[0]) handleImageFile(e.target.files[0]);
});

async function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('Please upload an image file.');
    return;
  }
  showLoading('Reading QR code from image...');
  const formData = new FormData();
  formData.append('image', file);
  await callBackend('/scan-image', formData, 'multipart');
}

// ── URL Input ─────────────────────────────────────────────────
urlScanBtn?.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a URL.'); return; }
  scanUrl(url);
});

urlInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') urlScanBtn.click();
});

async function scanUrl(url) {
  showLoading('Scanning URL for threats...');
  await callBackend('/scan-url', { url }, 'json');
}

// ── Live Camera Scanning ──────────────────────────────────────
startCamBtn?.addEventListener('click', startCamera);
stopCamBtn?.addEventListener('click',  stopCamera);
switchCamBtn?.addEventListener('click', switchCamera);

async function startCamera() {
  if (isScanning) return;

  // Load jsQR dynamically if not already loaded
  if (typeof jsQR === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  }

  try {
    setCameraStatus('🔍 Starting camera...', 'info');
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    });

    videoEl.srcObject = cameraStream;
    await videoEl.play();

    isScanning = true;
    startCamBtn.style.display  = 'none';
    stopCamBtn.style.display   = 'inline-flex';
    switchCamBtn.style.display = 'inline-flex';

    setCameraStatus('📷 Point camera at a QR code...', 'scanning');
    scanLoop();

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setCameraStatus('❌ Camera permission denied. Please allow camera access.', 'error');
    } else if (err.name === 'NotFoundError') {
      setCameraStatus('❌ No camera found on this device.', 'error');
    } else {
      setCameraStatus(`❌ Camera error: ${err.message}`, 'error');
    }
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (scanLoopId) {
    cancelAnimationFrame(scanLoopId);
    scanLoopId = null;
  }
  if (videoEl) videoEl.srcObject = null;

  isScanning = false;
  if (startCamBtn)  startCamBtn.style.display  = 'inline-flex';
  if (stopCamBtn)   stopCamBtn.style.display   = 'none';
  if (switchCamBtn) switchCamBtn.style.display = 'none';
  setCameraStatus('', '');
}

async function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  stopCamera();
  await startCamera();
}

function scanLoop() {
  if (!isScanning) return;

  const ctx = canvasEl.getContext('2d');
  canvasEl.width  = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;

  if (canvasEl.width > 0 && canvasEl.height > 0) {
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code) {
      // QR found! — draw green box and scan it
      drawQRBox(ctx, code.location);
      setCameraStatus(`✅ QR detected! Scanning...`, 'found');
      stopCamera();
      scanUrl(code.data);
      return;
    }
  }

  scanLoopId = requestAnimationFrame(scanLoop);
}

function drawQRBox(ctx, location) {
  ctx.beginPath();
  ctx.moveTo(location.topLeftCorner.x,     location.topLeftCorner.y);
  ctx.lineTo(location.topRightCorner.x,    location.topRightCorner.y);
  ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
  ctx.lineTo(location.bottomLeftCorner.x,  location.bottomLeftCorner.y);
  ctx.closePath();
  ctx.lineWidth   = 4;
  ctx.strokeStyle = '#00ffe0';
  ctx.stroke();
}

function setCameraStatus(msg, type) {
  if (!cameraStatus) return;
  cameraStatus.textContent  = msg;
  cameraStatus.className    = `camera-status ${type}`;
}

// ── Backend calls ─────────────────────────────────────────────
async function callBackend(endpoint, data, mode) {
  try {
    let response;
    if (mode === 'multipart') {
      response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'X-QRShield-Secret': QRSHIELD_SECRET },
        body: data
      });
    } else {
      response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-QRShield-Secret': QRSHIELD_SECRET
        },
        body: JSON.stringify(data)
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    showResult(result);

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

// ── UI helpers ────────────────────────────────────────────────
function showLoading(msg = 'Scanning...') {
  resultBox.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>${msg}</p>
    </div>`;
  resultBox.style.display = 'block';
  scanAgainBtn && (scanAgainBtn.style.display = 'none');
}

function showError(msg) {
  resultBox.innerHTML = `
    <div class="result-card danger">
      <div class="verdict-badge danger">⚠️ ERROR</div>
      <p class="error-msg">${msg}</p>
    </div>`;
  resultBox.style.display = 'block';
  scanAgainBtn && (scanAgainBtn.style.display = 'inline-flex');
}

function showResult(data) {
  const verdict      = (data.verdict || 'UNKNOWN').toUpperCase();
  const score        = data.risk_score ?? '—';
  const url          = data.url || '';
  const summary      = data.summary || '';
  const vtPositives  = data.virustotal_positives ?? null;
  const vtTotal      = data.virustotal_total ?? null;

  const verdictClass = verdict === 'SAFE'   ? 'safe'
                     : verdict === 'DANGER' ? 'danger'
                     : 'warn';

  const verdictIcon  = verdict === 'SAFE'   ? '✅'
                     : verdict === 'DANGER' ? '🚨'
                     : '⚠️';

  const vtSection = vtPositives !== null ? `
    <div class="detail-row">
      <span class="detail-label">VirusTotal</span>
      <span class="detail-value ${vtPositives > 0 ? 'danger-text' : 'safe-text'}">
        ${vtPositives} / ${vtTotal} engines flagged
      </span>
    </div>` : '';

  resultBox.innerHTML = `
    <div class="result-card ${verdictClass}">
      <div class="verdict-badge ${verdictClass}">${verdictIcon} ${verdict}</div>
      <div class="risk-score-wrap">
        <div class="risk-score-circle ${verdictClass}">${score}</div>
        <span class="risk-label">Risk Score</span>
      </div>
      ${url ? `<div class="detail-row">
        <span class="detail-label">URL</span>
        <span class="detail-value url-text">${escHtml(url)}</span>
      </div>` : ''}
      ${vtSection}
      ${summary ? `<div class="summary-box"><p>${escHtml(summary)}</p></div>` : ''}
    </div>`;

  resultBox.style.display = 'block';
  scanAgainBtn && (scanAgainBtn.style.display = 'inline-flex');
}

scanAgainBtn?.addEventListener('click', () => {
  resultBox.style.display = 'none';
  if (urlInput) urlInput.value = '';
  if (fileInput) fileInput.value = '';
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
