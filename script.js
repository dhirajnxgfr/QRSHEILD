
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>?/|\\[]{}~';
const rand  = () => CHARS[Math.floor(Math.random() * CHARS.length)];

// ── BACKEND CONFIG ────────────────────────────────────────────
const BACKEND_URL     = '';
const API_ENDPOINT    = '/api/analyze';
const QRSHIELD_SECRET = 'change-this-to-your-secret'; // match Vercel env var


// ── LOAD jsQR DYNAMICALLY ─────────────────────────────────────
// jsQR is a pure JS QR decoder — no Python libs needed on server
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

/**
 * Decodes QR from image using jsQR (runs in browser, no server needed).
 * If QR found → scans the decoded URL directly.
 * If no QR found → shows error message.
 */
function processFile(file) {
  const label = document.getElementById('selectedFile');
  label.style.display = 'block';
  label.textContent   = '📎 ' + file.name;

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = new Image();
    img.onload = function() {
      // Draw image to canvas to extract pixel data for jsQR
      const canvas  = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Wait for jsQR to load if it hasn't yet
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
          // QR decoded successfully — scan the URL
          document.getElementById('urlInput').value = code.data;
          label.textContent = `📎 ${file.name} → ${code.data.slice(0, 40)}${code.data.length > 40 ? '…' : ''}`;
          runScan(code.data);
        } else {
          // Try inverted (some QR codes have inverted colors)
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
  document.querySelector('.scan-btn').disabled = true;
}

function _endScanUI() {
  document.getElementById('scanning').classList.remove('show');
  document.querySelector('.scan-btn').disabled = false;
}


// ═══════════════════════════════════════════════════════════════
//  CORE: SECURE API CALL → /api/analyze
//  QR decoding is now done in browser — backend only gets URLs
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
