const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>?/|\\[]{}~';
const rand  = () => CHARS[Math.floor(Math.random() * CHARS.length)];

// ── BACKEND CONFIG ────────────────────────────────────────────
const BACKEND_URL     = '';
const API_ENDPOINT    = '/api/analyze';
const QRSHIELD_SECRET = 'change-this-to-your-secret';


// ── LOAD jsQR DYNAMICALLY ─────────────────────────────────────
(function loadJsQR() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  document.head.appendChild(script);
})();


// ── GLITCH LOGO ───────────────────────────────────────────────
function buildGlitchLogo(el) {
  const original = el.textContent.trim().replace(/\s/g,'');
  el.innerHTML = '';
  original.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    span.dataset.original = ch;
    if (i >= 2) span.style.color = 'var(--cyan)';
    el.appendChild(span);
  });
}

function scrambleIn(el) {
  const chars    = el.querySelectorAll('.char');
  const original = Array.from(chars).map(s => s.dataset.original);
  let iterations = 0;
  clearInterval(el._timer);
  el._timer = setInterval(() => {
    chars.forEach((span, i) => {
      if (iterations > i * 1.8) {
        span.textContent  = original[i];
        span.classList.remove('scrambling');
        span.style.color      = i >= 2 ? 'var(--cyan)' : '';
        span.style.textShadow = 'none';
      } else {
        span.textContent  = rand();
        span.classList.add('scrambling');
        span.style.color      = 'var(--cyan)';
        span.style.textShadow = 'none';
      }
    });
    iterations++;
    if (iterations > 18 + chars.length) {
      clearInterval(el._timer);
      chars.forEach((span, i) => {
        span.textContent  = original[i];
        span.classList.remove('scrambling');
        span.style.color      = i >= 2 ? 'var(--cyan)' : '';
        span.style.textShadow = 'none';
      });
    }
  }, 45);
}

function scrambleOut(el) {
  const chars    = el.querySelectorAll('.char');
  const original = Array.from(chars).map(s => s.dataset.original);
  let flashes    = 0;
  clearInterval(el._timer);
  el._timer = setInterval(() => {
    chars.forEach((span, i) => {
      if (flashes < 4) {
        span.textContent      = rand();
        span.style.color      = 'var(--cyan)';
        span.style.textShadow = 'none';
      } else {
        span.textContent  = original[i] || span.textContent;
        span.classList.remove('scrambling');
        span.style.color      = i >= 2 ? 'var(--cyan)' : '';
        span.style.textShadow = 'none';
      }
    });
    flashes++;
    if (flashes >= 6) clearInterval(el._timer);
  }, 40);
}

document.querySelectorAll('.glitch-logo').forEach(el => {
  buildGlitchLogo(el);
  el.addEventListener('mouseenter', () => scrambleIn(el));
  el.addEventListener('mouseleave', () => scrambleOut(el));
});


// ── MOBILE NAV ────────────────────────────────────────────────
function toggleMenu() {
  const links  = document.querySelector('.nav-links');
  const isOpen = links.style.display === 'flex';
  if (isOpen) { links.style.display = 'none'; return; }
  Object.assign(links.style, {
    display: 'flex', flexDirection: 'column',
    position: 'absolute', top: '70px', left: '0', right: '0',
    background: 'rgba(3,8,17,0.98)', padding: '20px',
    borderBottom: '1px solid #102040', zIndex: '499',
  });
}
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelector('.nav-links').style.display = 'none';
  });
});


// ══════════════════════════════════════════════════════════════
//  CAMERA SCANNER MODULE
// ══════════════════════════════════════════════════════════════

let cameraStream = null;
let cameraAnimFrame = null;
let cameraActive = false;
let lastQRDetected = '';
let lastQRTime = 0;
const QR_COOLDOWN_MS = 4000; // don't re-scan the same QR within 4s

const camVideo   = document.getElementById('camVideo');
const camCanvas  = document.getElementById('camCanvas');
const camOverlay = document.getElementById('camOverlay');
const camStatus  = document.getElementById('camStatus');

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.input-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab !== 'camera') {
    stopCamera();
  }
}

document.querySelectorAll('.input-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Start camera
async function startCamera() {
  const startBtn = document.getElementById('camStartBtn');
  const stopBtn  = document.getElementById('camStopBtn');

  try {
    setCamStatus('Requesting camera access…', 'pending');
    startBtn.style.display = 'none';

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' }, // back camera on phones
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    camVideo.srcObject = cameraStream;
    await camVideo.play();

    cameraActive = true;
    stopBtn.style.display = 'inline-flex';
    setCamStatus('SCANNING — Point at a QR code', 'active');

    // Start frame analysis loop
    scanCameraFrame();

  } catch (err) {
    startBtn.style.display = 'inline-flex';
    if (err.name === 'NotAllowedError') {
      setCamStatus('Camera access denied. Allow permission and retry.', 'error');
    } else if (err.name === 'NotFoundError') {
      setCamStatus('No camera detected on this device.', 'error');
    } else {
      setCamStatus(`Camera error: ${err.message}`, 'error');
    }
  }
}

function stopCamera() {
  cameraActive = false;
  if (cameraAnimFrame) cancelAnimationFrame(cameraAnimFrame);
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  camVideo.srcObject = null;
  clearQROverlay();

  const startBtn = document.getElementById('camStartBtn');
  const stopBtn  = document.getElementById('camStopBtn');
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn)  stopBtn.style.display  = 'none';

  setCamStatus('Camera stopped.', 'idle');
}

// Continuous frame scanning
function scanCameraFrame() {
  if (!cameraActive) return;

  if (camVideo.readyState === camVideo.HAVE_ENOUGH_DATA) {
    const ctx = camCanvas.getContext('2d');
    camCanvas.width  = camVideo.videoWidth;
    camCanvas.height = camVideo.videoHeight;
    ctx.drawImage(camVideo, 0, 0);

    const imageData = ctx.getImageData(0, 0, camCanvas.width, camCanvas.height);

    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        const now = Date.now();
        const isDuplicate = code.data === lastQRDetected && (now - lastQRTime) < QR_COOLDOWN_MS;

        if (!isDuplicate) {
          lastQRDetected = code.data;
          lastQRTime = now;
          drawQRCorners(code.location);
          triggerQRFound(code.data);
        } else {
          drawQRCorners(code.location);
        }
      } else {
        clearQROverlay();
      }
    }
  }

  cameraAnimFrame = requestAnimationFrame(scanCameraFrame);
}

// Draw corner brackets on overlay canvas
function drawQRCorners(location) {
  const overlayCanvas = document.getElementById('camOverlayCanvas');
  if (!overlayCanvas) return;

  overlayCanvas.width  = camVideo.videoWidth  || overlayCanvas.offsetWidth;
  overlayCanvas.height = camVideo.videoHeight || overlayCanvas.offsetHeight;

  const scaleX = overlayCanvas.offsetWidth  / (camVideo.videoWidth  || 1);
  const scaleY = overlayCanvas.offsetHeight / (camVideo.videoHeight || 1);

  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const corners = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner
  ];

  const cx = corners.map(p => p.x * scaleX);
  const cy = corners.map(p => p.y * scaleY);

  const armLen = Math.min(
    Math.hypot(cx[1]-cx[0], cy[1]-cy[0]),
    Math.hypot(cx[3]-cx[0], cy[3]-cy[0])
  ) * 0.28;

  ctx.strokeStyle = '#00ffe0';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';

  // Draw L-brackets at each corner
  const pairs = [[0,1,3],[1,0,2],[2,1,3],[3,0,2]]; // corner, adj1, adj2
  corners.forEach((_, ci) => {
    const bx = cx[ci], by = cy[ci];

    // vector towards adjacent corners, normalized
    function arm(from, to) {
      const dx = cx[to]-cx[from], dy = cy[to]-cy[from];
      const len = Math.hypot(dx,dy) || 1;
      return { x: dx/len * armLen, y: dy/len * armLen };
    }

    const adj = ci === 0 ? [1,3] : ci === 1 ? [0,2] : ci === 2 ? [1,3] : [0,2];
    const a1 = arm(ci, adj[0]);
    const a2 = arm(ci, adj[1]);

    ctx.beginPath();
    ctx.moveTo(bx + a1.x, by + a1.y);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + a2.x, by + a2.y);
    ctx.stroke();
  });
}

function clearQROverlay() {
  const oc = document.getElementById('camOverlayCanvas');
  if (oc) {
    const ctx = oc.getContext('2d');
    ctx.clearRect(0, 0, oc.width, oc.height);
  }
}

// When QR is found — flash and scan
function triggerQRFound(data) {
  setCamStatus('QR DETECTED — Analyzing…', 'detected');

  // Flash effect on video wrapper
  const wrapper = document.getElementById('camWrapper');
  wrapper.classList.add('qr-flash');
  setTimeout(() => wrapper.classList.remove('qr-flash'), 600);

  // Fill URL field and run scan
  document.getElementById('urlInput').value = data;
  switchTab('url');
  runScan(data);

  setCamStatus(`Found: ${data.slice(0,40)}${data.length>40?'…':''}`, 'idle');
}

function setCamStatus(msg, state) {
  if (!camStatus) return;
  camStatus.textContent = msg;
  camStatus.className   = `cam-status cam-status--${state}`;
}

// Capture single frame from gallery/photo
function captureGalleryFrame() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // hint mobile to open camera directly
  input.onchange = e => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };
  input.click();
}


// ── DRAG-AND-DROP QR UPLOAD ───────────────────────────────────
const zone = document.getElementById('uploadZone');

zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
zone.addEventListener('drop', e => {
  e.preventDefault();
  zone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processFile(file);
});

function handleFile(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const label = document.getElementById('selectedFile');
  label.style.display = 'block';
  label.style.color   = 'var(--cyan)';
  label.textContent   = '📎 ' + file.name;

  // Switch to upload tab if on camera tab
  if (document.getElementById('tab-upload').classList.contains('active') === false) {
    switchTab('upload');
  }

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      const canvas  = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      function tryDecode(attempts) {
        if (typeof jsQR === 'undefined') {
          if (attempts > 20) {
            showUploadError('jsQR library failed to load. Try pasting the URL manually.');
            return;
          }
          setTimeout(() => tryDecode(attempts + 1), 200);
          return;
        }

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          document.getElementById('urlInput').value = code.data;
          label.textContent = `📎 ${file.name} → ${code.data.slice(0, 40)}${code.data.length > 40 ? '…' : ''}`;
          runScan(code.data);
        } else {
          const codeInv = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'onlyInvert'
          });
          if (codeInv && codeInv.data) {
            document.getElementById('urlInput').value = codeInv.data;
            label.textContent = `📎 ${file.name} → ${codeInv.data.slice(0, 40)}…`;
            runScan(codeInv.data);
          } else {
            showUploadError('No QR code found in image. Make sure the image contains a clear QR code.');
          }
        }
      }

      tryDecode(0);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function showUploadError(msg) {
  const label = document.getElementById('selectedFile');
  label.style.display = 'block';
  label.textContent   = '⚠️ ' + msg;
  label.style.color   = 'var(--red)';
  document.querySelector('.scan-btn').disabled = false;
}


// ── URL SCAN ──────────────────────────────────────────────────
function scanURL() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  runScan(url);
}


// ── SCAN STEP ANIMATION ───────────────────────────────────────
let stepTimers = [];

function clearStepTimers() {
  stepTimers.forEach(t => clearTimeout(t));
  stepTimers = [];
}

function animateScanSteps(onComplete) {
  const steps  = ['step1','step2','step3','step4'];
  const labels = [
    '▶ Parsing URL structure...',
    '▶ Running heuristic checks...',
    '▶ Querying threat databases...',
    '▶ Computing risk score...'
  ];

  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    el.className   = 'scan-step';
    el.textContent = labels[i];
  });

  let delay = 0;
  steps.forEach((id, i) => {
    stepTimers.push(setTimeout(() => {
      document.getElementById(id).classList.add('active');
    }, delay));
    delay += 600;

    stepTimers.push(setTimeout(() => {
      const el = document.getElementById(id);
      el.classList.remove('active');
      el.classList.add('done');
      el.textContent = el.textContent.replace('▶ ', '');
      if (i === steps.length - 1 && onComplete) setTimeout(onComplete, 300);
    }, delay));
    delay += 200;
  });
}


// ── SCAN ORCHESTRATOR ─────────────────────────────────────────
function runScan(input) {
  _startScanUI();
  clearStepTimers();
  animateScanSteps(() => {
    analyzeThreat(input)
      .then(result => { _endScanUI(); showResult(input, result); })
      .catch(err   => { _endScanUI(); showErrorResult(input, err.message); });
  });
}

function _startScanUI() {
  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultCard').classList.remove('show');
  document.getElementById('scanning').classList.add('show');
  const scanBtns = document.querySelectorAll('.scan-btn');
  scanBtns.forEach(b => b.disabled = true);
}

function _endScanUI() {
  document.getElementById('scanning').classList.remove('show');
  const scanBtns = document.querySelectorAll('.scan-btn');
  scanBtns.forEach(b => b.disabled = false);
}


// ═══════════════════════════════════════════════════════════════
//  CORE: API CALL → /api/analyze
// ═══════════════════════════════════════════════════════════════

async function analyzeThreat(urlInput) {
  const response = await fetch(`${BACKEND_URL}${API_ENDPOINT}`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'X-QRShield-Secret': QRSHIELD_SECRET,
    },
    body: JSON.stringify({ type: 'url', input: urlInput })
  });

  if (response.status === 429) {
    const retry = response.headers.get('Retry-After') || '60';
    throw new Error(`Rate limit reached. Try again in ${retry}s.`);
  }
  if (response.status === 401) {
    throw new Error('Authentication failed. Check QRSHIELD_SECRET.');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API error ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}


// ── LOCAL HEURISTIC FALLBACK ──────────────────────────────────
function runLocalHeuristics(url) {
  const checks = [];
  let score = 0, lower = '';

  try { lower = new URL(url.startsWith('http') ? url : 'http://' + url).hostname.toLowerCase(); }
  catch(e) { lower = url.toLowerCase(); }
  const full = url.toLowerCase();

  const brands  = ['paypal','amazon','google','microsoft','apple','facebook','netflix','instagram','whatsapp'];
  const typoRe  = [/pay[^a]al/i,/amaz[o0]n/i,/g[o0]{2}gle/i,/micr[o0]s[o0]ft/i,/app1e/i];
  const hasTypo = typoRe.some(p=>p.test(lower)) || brands.some(b=>lower.includes(b)&&!lower.match(new RegExp(`^(www\\.)?${b}\\.(com|net|org)$`)));
  checks.push({label:'Typosquatting check',status:hasTypo?'fail':'pass',detail:hasTypo?'Lookalike brand domain':'No lookalike patterns found'});
  if(hasTypo) score+=30;

  const suspTLDs=['.xyz','.tk','.ml','.cf','.ga','.top','.click','.download','.gq','.pw','.cc'];
  const hasTLD=suspTLDs.some(t=>lower.endsWith(t));
  checks.push({label:'Suspicious TLD',status:hasTLD?'warn':'pass',detail:hasTLD?'High-risk TLD':'TLD appears legitimate'});
  if(hasTLD) score+=15;

  const shorteners=['bit.ly','tinyurl','t.co','goo.gl','ow.ly','short.io','is.gd','rb.gy','cutt.ly'];
  const isShort=shorteners.some(s=>lower.includes(s));
  checks.push({label:'Redirect chain',status:isShort?'warn':'pass',detail:isShort?'URL shortener detected':'No redirect obfuscation'});
  if(isShort) score+=10;

  const hasObfusc=/@/.test(url)||/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lower)||url.length>200||/%[0-9a-f]{2}/i.test(url);
  checks.push({label:'URL obfuscation',status:hasObfusc?'fail':'pass',detail:hasObfusc?'Obfuscation detected':'URL looks clean'});
  if(hasObfusc) score+=20;

  const impWords=['secure','verify','login','update','account','banking','payment','confirm'];
  const trusted=['google.com','microsoft.com','apple.com','github.com','amazon.com'];
  const hasImp=impWords.some(w=>full.includes(w))&&!trusted.some(d=>lower===d||lower==='www.'+d);
  checks.push({label:'Brand impersonation',status:hasImp?'warn':'pass',detail:hasImp?'Credential keywords in URL':'No impersonation found'});
  if(hasImp) score+=12;

  const isHttp=url.startsWith('http://')&&!url.startsWith('https://');
  const isDanger=/^(javascript:|data:|vbscript:)/i.test(url);
  checks.push({label:'HTTPS / protocol safety',status:isDanger?'fail':isHttp?'warn':'pass',detail:isDanger?'Dangerous protocol!':isHttp?'Not using HTTPS':'Secure HTTPS'});
  if(isDanger) score+=40; else if(isHttp) score+=5;

  const suspPaths=['/login','/signin','/account','/verify','/secure','/banking','/payment','.apk','.exe'];
  const hasSP=suspPaths.some(p=>full.includes(p));
  checks.push({label:'Suspicious path/params',status:hasSP?'warn':'pass',detail:hasSP?'Sensitive path keywords':'Path appears benign'});
  if(hasSP) score+=8;

  const hasRep=lower.split('-').length-1>=3||/[a-z0-9]{14,}/.test(lower.replace(/\./g,''));
  checks.push({label:'Domain reputation',status:hasRep?'warn':'pass',detail:hasRep?'Domain looks auto-generated':'Domain looks normal'});
  if(hasRep) score+=10;

  score=Math.min(score,100);
  const verdict=score>=56?'danger':score>=26?'warn':'safe';
  return {verdict,score,decoded_url:url,checks,summary:null};
}


// ── RENDER RESULT ─────────────────────────────────────────────
function showResult(input, result) {
  const bar = document.getElementById('verdictBar');
  bar.className = 'verdict-bar ' + result.verdict;
  document.getElementById('verdictText').textContent = result.verdict.toUpperCase();

  const decoded = result.decoded_url || input;
  document.getElementById('urlDecoded').textContent =
    decoded.length > 70 ? decoded.slice(0, 70) + '…' : decoded;

  const score = Math.min(Math.max(parseInt(result.score)||0, 0), 100);
  const arc   = document.getElementById('scoreArc');
  const numEl = document.getElementById('scoreNum');
  const circ  = 163.4;
  let cur = 0;
  const t = setInterval(() => {
    cur = Math.min(cur + 2, score);
    numEl.textContent          = cur;
    arc.style.strokeDashoffset = circ - (circ * cur / 100);
    if (cur >= score) clearInterval(t);
  }, 18);

  const list  = document.getElementById('checkList');
  const icons = { pass:'✓', fail:'✕', warn:'!' };
  list.innerHTML = '';
  (result.checks || []).forEach(c => {
    const li = document.createElement('li');
    li.className = 'check-item';
    const detail = c.detail ? ` — <span style="color:var(--muted);font-size:10px;">${c.detail}</span>` : '';
    li.innerHTML = `<span class="status ${c.status}">${icons[c.status]||'?'}</span><span>${c.label}${detail}</span>`;
    list.appendChild(li);
  });

  const summaryEl = document.getElementById('aiSummary');
  if (result.summary) {
    document.getElementById('aiText').textContent = result.summary;
    summaryEl.style.display = 'block';
  } else {
    summaryEl.style.display = 'none';
  }

  document.getElementById('resultCard').classList.add('show');

  // Scroll result panel into view on mobile
  if (window.innerWidth < 768) {
    document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function showErrorResult(input, errorMsg) {
  const r = runLocalHeuristics(input);
  r.summary = `Note: Backend unavailable (${errorMsg||'network error'}). Local heuristic analysis only.`;
  showResult(input, r);
}


// ── SCROLL REVEAL ─────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.style.animation = 'fadeDown 0.6s ease both';
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feat-card, .step, .threat-card').forEach(el => observer.observe(el));

document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') scanURL();
});

// Stop camera when navigating away from demo section
const demoSection = document.getElementById('demo');
const stopCameraObserver = new IntersectionObserver(entries => {
  if (!entries[0].isIntersecting && cameraActive) {
    stopCamera();
  }
}, { threshold: 0 });
if (demoSection) stopCameraObserver.observe(demoSection);
document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') scanURL();
});
