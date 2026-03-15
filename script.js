// ═══════════════════════════════════════════════════════════════
//  QR SHIELD — script.js
//  Real AI-powered threat analysis via Claude (Anthropic API)
// ═══════════════════════════════════════════════════════════════

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>?/|\\[]{}~';
const rand  = () => CHARS[Math.floor(Math.random() * CHARS.length)];

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
  const original = el.textContent.replace(/\s/g,'').split('').map((_,i)=>chars[i]?.dataset?.original||'');
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
  const original = chars.length ? Array.from(chars).map(s=>s.dataset.original) : [];
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

function processFile(file) {
  const label = document.getElementById('selectedFile');
  label.style.display = 'block';
  label.textContent   = '📎 ' + file.name;

  // Read file as base64 and try to extract QR content client-side
  // then fall back to filename-based analysis
  const reader = new FileReader();
  reader.onload = function(ev) {
    const base64 = ev.target.result; // data:image/...;base64,...
    // We'll pass the image to the AI for analysis
    runScanWithImage(file.name, base64);
  };
  reader.readAsDataURL(file);
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
  const steps = ['step1','step2','step3','step4'];

  // Reset all
  steps.forEach(id => {
    const el = document.getElementById(id);
    el.className = 'scan-step';
  });

  let delay = 0;
  steps.forEach((id, i) => {
    // Activate
    stepTimers.push(setTimeout(() => {
      document.getElementById(id).classList.add('active');
    }, delay));
    delay += 600;

    // Mark done
    stepTimers.push(setTimeout(() => {
      const el = document.getElementById(id);
      el.classList.remove('active');
      el.classList.add('done');
      // Remove the "▶" prefix from text (done adds ✓ via CSS)
      el.textContent = el.textContent.replace('▶ ', '');
      if (i === steps.length - 1 && onComplete) {
        setTimeout(onComplete, 300);
      }
    }, delay));
    delay += 200;
  });
}


// ── MAIN SCAN ORCHESTRATOR ────────────────────────────────────
function runScan(input) {
  _startScanUI();
  const stepDuration = 600 * 4 + 200 * 4 + 300; // ~3.3s for all steps

  // Start step animation; on complete call the AI
  clearStepTimers();
  animateScanSteps(() => {
    analyzeThreat(input, null).then(result => {
      document.getElementById('scanning').classList.remove('show');
      showResult(input, result);
      document.querySelector('.scan-btn').disabled = false;
    }).catch(err => {
      document.getElementById('scanning').classList.remove('show');
      showErrorResult(input, err.message);
      document.querySelector('.scan-btn').disabled = false;
    });
  });
}

function runScanWithImage(filename, base64) {
  _startScanUI();
  clearStepTimers();
  animateScanSteps(() => {
    analyzeThreat(filename, base64).then(result => {
      document.getElementById('scanning').classList.remove('show');
      showResult(filename, result);
      document.querySelector('.scan-btn').disabled = false;
    }).catch(err => {
      document.getElementById('scanning').classList.remove('show');
      showErrorResult(filename, err.message);
      document.querySelector('.scan-btn').disabled = false;
    });
  });
}

function _startScanUI() {
  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultCard').classList.remove('show');
  document.getElementById('scanning').classList.add('show');
  document.querySelector('.scan-btn').disabled = true;

  // Reset step text
  const stepLabels = [
    '▶ Parsing URL structure...',
    '▶ Running heuristic checks...',
    '▶ Querying threat databases...',
    '▶ Computing risk score...'
  ];
  stepLabels.forEach((label, i) => {
    const el = document.getElementById('step' + (i+1));
    el.textContent = label;
    el.className = 'scan-step';
  });
}


// ═══════════════════════════════════════════════════════════════
//  CORE: AI THREAT ANALYSIS ENGINE (via Flask backend proxy)
//  Backend runs at http://localhost:5000 — see backend.py
// ═══════════════════════════════════════════════════════════════

// Change this if your backend runs on a different host/port
const BACKEND_URL = 'http://localhost:5000';

/**
 * Sends URL or QR image to the Flask backend for Claude AI analysis.
 * Returns a structured result: { verdict, score, decoded_url, checks, summary }
 */
async function analyzeThreat(input, imageBase64) {

  const payload = imageBase64
    ? {
        type: 'image',
        filename: input,
        image_data: imageBase64   // full data-URI: "data:image/png;base64,..."
      }
    : {
        type: 'url',
        input: input
      };

  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Backend error ${response.status}`);
  }

  const data = await response.json();

  if (data.error) throw new Error(data.error);

  return data.result; // already parsed JSON from backend
}


// ── LOCAL HEURISTIC FALLBACK (runs offline if API unavailable) ─
/**
 * Pure JS heuristic analysis — 8 checks, no API needed.
 * Used as fallback / supplementary layer.
 */
function runLocalHeuristics(url) {
  const checks = [];
  let score = 0;
  let lower = '';

  try { lower = new URL(url.startsWith('http') ? url : 'http://' + url).hostname.toLowerCase(); }
  catch(e) { lower = url.toLowerCase(); }

  const fullLower = url.toLowerCase();

  // 1. Typosquatting
  const brands = ['paypal','amazon','google','microsoft','apple','facebook','netflix','instagram','whatsapp','bank'];
  const typoPatterns = [/pay[^a]/i,/amaz0n/i,/g00gle/i,/micros0ft/i,/app1e/i];
  const hasTypo = typoPatterns.some(p => p.test(lower)) ||
    brands.some(b => lower.includes(b) && !lower.match(new RegExp(`^(www\\.)?${b}\\.(com|net|org|co)$`)));
  checks.push({ label: 'Typosquatting check', status: hasTypo ? 'fail' : 'pass', detail: hasTypo ? 'Lookalike brand domain detected' : 'No lookalike patterns found' });
  if (hasTypo) score += 30;

  // 2. Suspicious TLD
  const suspTLDs = ['.xyz','.tk','.ml','.cf','.ga','.top','.click','.download','.gq','.pw','.cc','.info','.biz'];
  const hasSuspTLD = suspTLDs.some(t => lower.endsWith(t));
  checks.push({ label: 'Suspicious TLD', status: hasSuspTLD ? 'warn' : 'pass', detail: hasSuspTLD ? 'High-risk TLD associated with abuse' : 'TLD appears legitimate' });
  if (hasSuspTLD) score += 15;

  // 3. Redirect chain
  const shorteners = ['bit.ly','tinyurl','t.co','goo.gl','ow.ly','short.io','is.gd','buff.ly','rb.gy','tiny.cc','cutt.ly'];
  const isShortener = shorteners.some(s => lower.includes(s));
  checks.push({ label: 'Redirect chain', status: isShortener ? 'warn' : 'pass', detail: isShortener ? 'URL shortener may hide final destination' : 'No redirect obfuscation detected' });
  if (isShortener) score += 10;

  // 4. URL obfuscation
  const hasObfuscation = /@/.test(url) || /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lower) || url.length > 200 || /%[0-9a-f]{2}/i.test(url);
  checks.push({ label: 'URL obfuscation', status: hasObfuscation ? 'fail' : 'pass', detail: hasObfuscation ? 'Obfuscation technique detected in URL' : 'URL structure looks clean' });
  if (hasObfuscation) score += 20;

  // 5. Brand impersonation
  const impersonationWords = ['secure','verify','login','update','account','banking','payment','confirm','validate'];
  const hasImpersonation = impersonationWords.some(w => fullLower.includes(w)) && !['google','microsoft','apple'].some(b => lower === `${b}.com` || lower === `www.${b}.com`);
  checks.push({ label: 'Brand impersonation', status: hasImpersonation ? 'warn' : 'pass', detail: hasImpersonation ? 'Credential-harvesting keywords in URL' : 'No impersonation keywords found' });
  if (hasImpersonation) score += 12;

  // 6. HTTPS safety
  const isHttp = url.startsWith('http://') && !url.startsWith('https://');
  const isDangerousScheme = /^(javascript:|data:|vbscript:)/i.test(url);
  checks.push({ label: 'HTTPS / protocol safety', status: isDangerousScheme ? 'fail' : isHttp ? 'warn' : 'pass', detail: isDangerousScheme ? 'Dangerous protocol detected!' : isHttp ? 'Not using HTTPS encryption' : 'Secure protocol in use' });
  if (isDangerousScheme) score += 40;
  else if (isHttp) score += 5;

  // 7. Path suspicion
  const suspPathTerms = ['/login','/signin','/account','/verify','/secure','/banking','/update','/confirm','/payment','.apk','.exe','.zip'];
  const hasSuspPath = suspPathTerms.some(p => fullLower.includes(p));
  checks.push({ label: 'Suspicious path/params', status: hasSuspPath ? 'warn' : 'pass', detail: hasSuspPath ? 'Sensitive path keywords found' : 'Path appears benign' });
  if (hasSuspPath) score += 8;

  // 8. Domain reputation signals
  const hyphenCount = (lower.match(/-/g)||[]).length;
  const randomPattern = /[a-z0-9]{12,}/.test(lower.replace(/\./g,''));
  const hasRepSignal = hyphenCount >= 3 || randomPattern;
  checks.push({ label: 'Domain reputation', status: hasRepSignal ? 'warn' : 'pass', detail: hasRepSignal ? 'Domain pattern resembles auto-generated/random name' : 'Domain name looks normal' });
  if (hasRepSignal) score += 10;

  score = Math.min(score, 100);
  const verdict = score >= 56 ? 'danger' : score >= 26 ? 'warn' : 'safe';

  return { verdict, score, decoded_url: url, checks, summary: null };
}


// ── RENDER RESULT ─────────────────────────────────────────────
function showResult(input, result) {
  // Verdict bar
  const bar = document.getElementById('verdictBar');
  bar.className = 'verdict-bar ' + result.verdict;
  document.getElementById('verdictText').textContent = result.verdict.toUpperCase();

  // Decoded URL
  const decoded = result.decoded_url || input;
  document.getElementById('urlDecoded').textContent =
    decoded.length > 70 ? decoded.slice(0, 70) + '…' : decoded;

  // Score ring animation
  const score = Math.min(Math.max(parseInt(result.score) || 0, 0), 100);
  const arc   = document.getElementById('scoreArc');
  const numEl = document.getElementById('scoreNum');
  const circumference = 163.4;
  let current = 0;
  const scoreTimer = setInterval(() => {
    current = Math.min(current + 2, score);
    numEl.textContent          = current;
    arc.style.strokeDashoffset = circumference - (circumference * current / 100);
    if (current >= score) clearInterval(scoreTimer);
  }, 18);

  // Check list
  const list  = document.getElementById('checkList');
  const icons = { pass: '✓', fail: '✕', warn: '!' };
  list.innerHTML = '';
  (result.checks || []).forEach(c => {
    const li = document.createElement('li');
    li.className = 'check-item';
    const detail = c.detail ? ` — <span style="color:var(--muted);font-size:10px;">${c.detail}</span>` : '';
    li.innerHTML = `<span class="status ${c.status}">${icons[c.status] || '?'}</span><span>${c.label}${detail}</span>`;
    list.appendChild(li);
  });

  // AI Summary
  const summaryEl = document.getElementById('aiSummary');
  const summaryText = document.getElementById('aiText');
  if (result.summary) {
    summaryText.textContent = result.summary;
    summaryEl.style.display = 'block';
  } else {
    summaryEl.style.display = 'none';
  }

  document.getElementById('resultCard').classList.add('show');
}

function showErrorResult(input, errorMsg) {
  // Run local heuristics as fallback
  const localResult = runLocalHeuristics(input);
  localResult.summary = `Note: AI analysis unavailable (${errorMsg || 'network error'}). Showing local heuristic analysis only — results may be less accurate.`;
  showResult(input, localResult);
}


// ── SCROLL REVEAL ANIMATIONS ──────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.animation = 'fadeDown 0.6s ease both';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feat-card, .step, .threat-card').forEach(el => {
  observer.observe(el);
});


// ── URL INPUT: press Enter to scan ────────────────────────────
document.getElementById('urlInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') scanURL();
});
