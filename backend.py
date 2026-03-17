
import os, re, json, base64, logging, time, threading
from io import BytesIO
from collections import defaultdict
from functools import wraps

import requests as req_lib
import anthropic, cv2, numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from pyzbar import pyzbar

# ── CONFIG — all from environment, nothing hardcoded ──────────
ANTHROPIC_KEY   = os.environ.get('ANTHROPIC_API_KEY',   '')
VIRUSTOTAL_KEY  = os.environ.get('VIRUSTOTAL_API_KEY',  '')
FRONTEND_SECRET = os.environ.get('QRSHIELD_SECRET',     '')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS',     '*')
PORT            = int(os.environ.get('PORT',             5000))
DEBUG           = os.environ.get('DEBUG', 'false').lower() == 'true'
RATE_LIMIT_MAX  = int(os.environ.get('RATE_LIMIT_REQUESTS', 10))
RATE_LIMIT_WIN  = int(os.environ.get('RATE_LIMIT_WINDOW',   60))

VT_BASE = 'https://www.virustotal.com/api/v3'

# ── APP SETUP ─────────────────────────────────────────────────
app = Flask(__name__)
origins = [o.strip() for o in ALLOWED_ORIGINS.split(',')] if ALLOWED_ORIGINS != '*' else '*'
CORS(app, origins=origins)

logging.basicConfig(level=logging.INFO, format='[QRShield] %(levelname)s: %(message)s')
log = logging.getLogger(__name__)

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_KEY) if ANTHROPIC_KEY else None

if not ANTHROPIC_KEY:   log.warning("ANTHROPIC_API_KEY not set  — heuristic mode only")
if not VIRUSTOTAL_KEY:  log.warning("VIRUSTOTAL_API_KEY not set — VT checks disabled")
if not FRONTEND_SECRET: log.warning("QRSHIELD_SECRET not set    — endpoint is open (dev mode)")


# ═══════════════════════════════════════════════════════════════
#  SECURITY: SECRET KEY AUTH + RATE LIMITER
# ═══════════════════════════════════════════════════════════════

_rate_store: dict = defaultdict(list)

def get_client_ip() -> str:
    fwd = request.headers.get('X-Forwarded-For', '')
    return fwd.split(',')[0].strip() if fwd else (request.remote_addr or '0.0.0.0')

def is_rate_limited(ip: str) -> tuple:
    now, cutoff = time.time(), time.time() - RATE_LIMIT_WIN
    _rate_store[ip] = [t for t in _rate_store[ip] if t > cutoff]
    if len(_rate_store[ip]) >= RATE_LIMIT_MAX:
        retry = int(RATE_LIMIT_WIN - (now - _rate_store[ip][0])) + 1
        return True, retry
    _rate_store[ip].append(now)
    return False, 0

def require_secret(f):
    """Rejects requests missing the correct X-QRShield-Secret header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if FRONTEND_SECRET:
            if request.headers.get('X-QRShield-Secret', '') != FRONTEND_SECRET:
                log.warning(f"Rejected — bad secret from {get_client_ip()}")
                return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def check_rate_limit(f):
    """Limits each IP to RATE_LIMIT_MAX scans per RATE_LIMIT_WIN seconds."""
    @wraps(f)
    def decorated(*args, **kwargs):
        ip = get_client_ip()
        limited, retry = is_rate_limited(ip)
        if limited:
            log.warning(f"Rate limit: {ip}")
            r = jsonify({'error': f'Too many requests. Retry in {retry}s.'})
            r.headers['Retry-After'] = str(retry)
            return r, 429
        return f(*args, **kwargs)
    return decorated


# ═══════════════════════════════════════════════════════════════
#  VIRUSTOTAL
# ═══════════════════════════════════════════════════════════════

def virustotal_scan_url(url: str) -> dict:
    """Submit URL to VT, poll for result, return structured dict."""
    if not VIRUSTOTAL_KEY:
        return {'vt_available': False, 'vt_detail': 'VirusTotal API key not configured'}

    headers = {'x-apikey': VIRUSTOTAL_KEY, 'Content-Type': 'application/x-www-form-urlencoded'}

    try:
        # Submit
        log.info(f"[VT] Submitting: {url[:80]}")
        r = req_lib.post(f'{VT_BASE}/urls', headers=headers, data={'url': url}, timeout=10)
        if r.status_code == 429:
            return {'vt_available': False, 'vt_detail': 'VirusTotal rate limit (free: 4 req/min)'}
        r.raise_for_status()
        analysis_id = r.json()['data']['id']

        # Poll up to 15s
        result_data = None
        for attempt in range(5):
            time.sleep(3)
            poll = req_lib.get(f'{VT_BASE}/analyses/{analysis_id}', headers=headers, timeout=10)
            poll.raise_for_status()
            pj = poll.json()
            status = pj.get('data', {}).get('attributes', {}).get('status', '')
            log.info(f"[VT] Poll {attempt+1}: {status}")
            if status == 'completed':
                result_data = pj['data']['attributes']
                break

        # Fallback: fetch by URL ID
        if not result_data:
            url_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip('=')
            fb = req_lib.get(f'{VT_BASE}/urls/{url_id}', headers=headers, timeout=10)
            if fb.status_code == 200:
                result_data = fb.json().get('data', {}).get('attributes', {})
            else:
                return {'vt_available': False, 'vt_detail': 'VT analysis timed out — retry later'}

        # Parse
        stats      = result_data.get('stats', {})
        malicious  = stats.get('malicious', 0)
        suspicious = stats.get('suspicious', 0)
        total      = sum(stats.values()) or 1

        categories = set()
        for _, vdata in result_data.get('results', {}).items():
            if vdata.get('category') in ('malicious', 'suspicious') and vdata.get('result'):
                categories.add(vdata['result'])

        vt_verdict = 'danger' if malicious >= 3 else ('warn' if malicious >= 1 or suspicious >= 3 else 'safe')
        vt_link    = f"https://www.virustotal.com/gui/url/{base64.urlsafe_b64encode(url.encode()).decode().rstrip('=')}"
        detail     = (f"{malicious}/{total} vendors flagged malicious"
                      + (f", {suspicious} suspicious" if suspicious else '')
                      + (f". Threats: {', '.join(list(categories)[:3])}" if categories else ''))

        log.info(f"[VT] {malicious}/{total} malicious — {vt_verdict}")
        return {
            'vt_available': True, 'vt_score': malicious, 'vt_suspicious': suspicious,
            'vt_total': total, 'vt_verdict': vt_verdict, 'vt_link': vt_link,
            'vt_categories': list(categories)[:5], 'vt_detail': detail
        }

    except req_lib.exceptions.Timeout:
        return {'vt_available': False, 'vt_detail': 'VirusTotal request timed out'}
    except req_lib.exceptions.HTTPError as e:
        return {'vt_available': False, 'vt_detail': f'VT API error: {e.response.status_code}'}
    except Exception as e:
        log.error(f"[VT] Error: {e}")
        return {'vt_available': False, 'vt_detail': f'VT error: {e}'}


def merge_vt_into_result(result: dict, vt: dict) -> dict:
    """Inject VT result into main result, upgrade verdict/score if worse."""
    result['virustotal'] = vt

    if not vt.get('vt_available'):
        result['checks'].append({'label': 'VirusTotal reputation', 'status': 'warn',
                                  'detail': vt.get('vt_detail', 'Unavailable')})
        return result

    vt_status = {'safe': 'pass', 'warn': 'warn', 'danger': 'fail'}.get(vt['vt_verdict'], 'warn')
    result['checks'].append({'label': 'VirusTotal reputation', 'status': vt_status,
                              'detail': vt['vt_detail']})

    rank = {'safe': 0, 'warn': 1, 'danger': 2}
    if rank.get(vt['vt_verdict'], 0) > rank.get(result.get('verdict', 'safe'), 0):
        result['verdict'] = vt['vt_verdict']

    result['score'] = min(result.get('score', 0) + min(vt.get('vt_score', 0) * 10, 40), 100)

    suffix = f" VirusTotal: {vt['vt_detail']}."
    result['summary'] = (result.get('summary') or '') + suffix
    return result


# ═══════════════════════════════════════════════════════════════
#  QR DECODER
# ═══════════════════════════════════════════════════════════════

def decode_qr_from_image_bytes(image_bytes: bytes):
    try:
        pil = Image.open(BytesIO(image_bytes)).convert('RGB')
        bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

        objs = pyzbar.decode(pil)
        if objs: return objs[0].data.decode('utf-8', errors='replace')

        data, _, _ = cv2.QRCodeDetector().detectAndDecode(bgr)
        if data: return data

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        objs = pyzbar.decode(Image.fromarray(thresh))
        if objs: return objs[0].data.decode('utf-8', errors='replace')

        return None
    except Exception as e:
        log.error(f"QR decode error: {e}")
        return None

def decode_qr_from_base64(data_uri: str):
    try:
        b64 = data_uri.split(',')[1] if ',' in data_uri else data_uri
        return decode_qr_from_image_bytes(base64.b64decode(b64))
    except Exception as e:
        log.error(f"Base64 error: {e}")
        return None


# ═══════════════════════════════════════════════════════════════
#  LOCAL HEURISTICS (8 checks, pure Python, no API needed)
# ═══════════════════════════════════════════════════════════════

def run_local_heuristics(url: str) -> dict:
    from urllib.parse import urlparse
    checks, score = [], 0
    try:
        p     = urlparse(url if url.startswith('http') else 'http://' + url)
        lower = (p.hostname or '').lower()
        path  = p.path.lower()
    except Exception:
        lower, path = url.lower(), ''
    full = url.lower()

    brands   = ['paypal','amazon','google','microsoft','apple','facebook','netflix','instagram','whatsapp','chase','citibank']
    typo_re  = [r'pay[^a]al',r'amaz[o0]n',r'g[o0]{2}gle',r'micr[o0]s[o0]ft',r'app1e',r'f[a@]cebook',r'netfl1x',r'inst[a@]gram']
    has_typo = any(re.search(p, lower) for p in typo_re) or any(
        b in lower and not re.match(rf'^(www\.)?{re.escape(b)}\.(com|net|org|co\.uk)$', lower) for b in brands)
    checks.append({'label':'Typosquatting check','status':'fail' if has_typo else 'pass',
                   'detail':'Lookalike brand domain detected' if has_typo else 'No lookalike patterns found'})
    if has_typo: score += 30

    susp_tlds = ['.xyz','.tk','.ml','.cf','.ga','.top','.click','.download','.gq','.pw','.cc','.loan','.party']
    has_tld   = any(lower.endswith(t) for t in susp_tlds)
    checks.append({'label':'Suspicious TLD','status':'warn' if has_tld else 'pass',
                   'detail':'High-risk TLD associated with abuse' if has_tld else 'TLD appears legitimate'})
    if has_tld: score += 15

    shorteners = ['bit.ly','tinyurl','t.co','goo.gl','ow.ly','short.io','is.gd','rb.gy','cutt.ly','shorturl.at']
    is_short   = any(s in lower for s in shorteners)
    checks.append({'label':'Redirect chain','status':'warn' if is_short else 'pass',
                   'detail':'URL shortener may hide destination' if is_short else 'No redirect obfuscation detected'})
    if is_short: score += 10

    has_obfusc = ('@' in url or bool(re.search(r'\d{1,3}(\.\d{1,3}){3}', lower)) or
                  bool(re.search(r'%[0-9a-f]{2}', url, re.I)) or len(url) > 200)
    checks.append({'label':'URL obfuscation','status':'fail' if has_obfusc else 'pass',
                   'detail':'Obfuscation detected (@ / raw IP / hex)' if has_obfusc else 'URL structure looks clean'})
    if has_obfusc: score += 20

    imp_words = ['secure','verify','login','update','account','banking','payment','confirm','validate','signin']
    trusted   = ['google.com','microsoft.com','apple.com','github.com','amazon.com']
    has_imp   = any(w in full for w in imp_words) and not any(lower in (d, 'www.'+d) for d in trusted)
    checks.append({'label':'Brand impersonation','status':'warn' if has_imp else 'pass',
                   'detail':'Credential-harvesting keywords in URL' if has_imp else 'No impersonation keywords found'})
    if has_imp: score += 12

    is_http   = url.startswith('http://') and not url.startswith('https://')
    is_danger = bool(re.match(r'^(javascript:|data:|vbscript:)', url, re.I))
    checks.append({'label':'HTTPS / protocol safety',
                   'status':'fail' if is_danger else ('warn' if is_http else 'pass'),
                   'detail':'DANGEROUS protocol!' if is_danger else ('Not using HTTPS' if is_http else 'Secure HTTPS in use')})
    if is_danger: score += 40
    elif is_http: score += 5

    susp_paths = ['/login','/signin','/account','/verify','/secure','/banking','/payment','.apk','.exe','.ps1']
    has_sp     = any(p in path or p in full for p in susp_paths)
    checks.append({'label':'Suspicious path/params','status':'warn' if has_sp else 'pass',
                   'detail':'Sensitive path keywords found' if has_sp else 'Path appears benign'})
    if has_sp: score += 8

    has_rep = lower.count('-') >= 3 or bool(re.search(r'[a-z0-9]{14,}', lower.replace('.', '')))
    checks.append({'label':'Domain reputation','status':'warn' if has_rep else 'pass',
                   'detail':'Domain resembles auto-generated name' if has_rep else 'Domain name looks normal'})
    if has_rep: score += 10

    score   = min(score, 100)
    verdict = 'danger' if score >= 56 else ('warn' if score >= 26 else 'safe')
    return {'verdict': verdict, 'score': score, 'decoded_url': url, 'checks': checks, 'summary': None}


# ═══════════════════════════════════════════════════════════════
#  CLAUDE AI ANALYSIS
# ═══════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are QR Shield's threat analysis engine — a cybersecurity AI that analyzes URLs and QR codes for malicious content.

Perform these 8 heuristic checks:
1. Typosquatting detection (lookalike domains, character substitution)
2. Suspicious TLD analysis (.xyz, .tk, .ml, .cf, .ga, .top, .click, etc.)
3. Redirect chain indicators (URL shorteners, multi-hop patterns)
4. URL obfuscation patterns (hex encoding, @ symbols, raw IP addresses)
5. Brand impersonation (brand names embedded in suspicious domains)
6. HTTPS / protocol safety (non-HTTPS, data:, javascript: protocols)
7. Path/parameter suspicion (login, verify, secure, payment in path)
8. Domain reputation signals (random strings, excessive hyphens)

Respond ONLY with valid JSON — no preamble, no markdown fences:

{
  "verdict": "safe" | "warn" | "danger",
  "score": <integer 0-100>,
  "decoded_url": "<URL analyzed>",
  "checks": [
    { "label": "<check name>", "status": "pass"|"warn"|"fail", "detail": "<finding>" },
    ...exactly 8 checks...
  ],
  "summary": "<2-3 sentence plain-English verdict and recommended action>"
}

Scoring: 0-25 safe · 26-55 warn · 56-100 danger. Don't flag legitimate sites like google.com or github.com."""


def analyze_with_claude(url_input: str, image_data_uri=None) -> dict:
    if not anthropic_client:
        raise RuntimeError("Anthropic API key not configured")

    if image_data_uri:
        mt  = image_data_uri.split(';')[0].replace('data:', '') if ',' in image_data_uri else 'image/png'
        b64 = image_data_uri.split(',')[1] if ',' in image_data_uri else image_data_uri
        content = [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': mt, 'data': b64}},
            {'type': 'text',  'text': (f"Analyze this QR code. Decoded URL: {url_input}. Full threat analysis."
                                       if url_input else "Decode this QR code and analyze for threats.")}
        ]
    else:
        content = f"Analyze this URL for security threats: {url_input}"

    log.info(f"[Claude] Analyzing: {str(url_input)[:80]}")
    msg = anthropic_client.messages.create(
        model='claude-sonnet-4-20250514', max_tokens=1024,
        system=SYSTEM_PROMPT, messages=[{'role': 'user', 'content': content}]
    )
    raw     = ''.join(b.text for b in msg.content if b.type == 'text')
    cleaned = re.sub(r'```json|```', '', raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r'\{[\s\S]*\}', cleaned)
        if m: return json.loads(m.group())
        raise ValueError(f"Cannot parse Claude response: {cleaned[:200]}")


# ═══════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok', 'version': '2.1.0',
        'ai_enabled':   anthropic_client is not None,
        'virustotal':   bool(VIRUSTOTAL_KEY),
        'secret_auth':  bool(FRONTEND_SECRET),
        'rate_limit':   f"{RATE_LIMIT_MAX} req/{RATE_LIMIT_WIN}s"
    })


@app.route('/analyze', methods=['POST'])
@require_secret     # blocks requests without X-QRShield-Secret header
@check_rate_limit   # 10 scans/min per IP (configurable)
def analyze():
    try:
        body       = request.get_json(silent=True) or {}
        scan_type  = body.get('type', 'url')
        image_data = body.get('image_data')
        url_input  = body.get('input', '')
        filename   = body.get('filename', '')

        # ── IMAGE SCAN ────────────────────────────────────────
        if scan_type == 'image' and image_data:
            log.info(f"Image scan: {filename}")
            decoded_url = decode_qr_from_base64(image_data) or ''
            if decoded_url: log.info(f"QR decoded: {decoded_url}")

            if anthropic_client:
                try:
                    result = analyze_with_claude(decoded_url, image_data)
                    if decoded_url and not result.get('decoded_url'):
                        result['decoded_url'] = decoded_url
                except Exception as e:
                    log.error(f"Claude error: {e}")
                    result = run_local_heuristics(decoded_url) if decoded_url else _no_qr_result(filename)
            elif decoded_url:
                result = run_local_heuristics(decoded_url)
            else:
                result = _no_qr_result(filename)

            if decoded_url and VIRUSTOTAL_KEY:
                result = merge_vt_into_result(result, virustotal_scan_url(decoded_url))

            return jsonify({'result': result})

        # ── URL SCAN ──────────────────────────────────────────
        elif url_input:
            log.info(f"URL scan: {url_input[:80]}")

            if anthropic_client:
                try:
                    result = analyze_with_claude(url_input)
                except Exception as e:
                    log.error(f"Claude error: {e}")
                    result = run_local_heuristics(url_input)
                    result['summary'] = "AI unavailable — heuristic results only."
            else:
                result = run_local_heuristics(url_input)
                result['summary'] = "AI unavailable — heuristic results only."

            if VIRUSTOTAL_KEY:
                result = merge_vt_into_result(result, virustotal_scan_url(url_input))
            else:
                result['checks'].append({'label': 'VirusTotal reputation', 'status': 'warn',
                                          'detail': 'VIRUSTOTAL_API_KEY not set'})

            return jsonify({'result': result})

        else:
            return jsonify({'error': 'No input provided.'}), 400

    except Exception as e:
        log.error(f"Unhandled error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


def _no_qr_result(filename: str) -> dict:
    return {
        'verdict': 'warn', 'score': 20,
        'decoded_url': filename or 'Unknown',
        'checks': [
            {'label': 'QR Decoding',             'status': 'warn', 'detail': 'No QR code detected in image'},
            {'label': 'Typosquatting check',     'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'Suspicious TLD',          'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'Redirect chain',          'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'URL obfuscation',         'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'Brand impersonation',     'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'HTTPS / protocol safety', 'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
            {'label': 'Domain reputation',       'status': 'pass', 'detail': 'Cannot check — no URL decoded'},
        ],
        'summary': 'No QR code could be decoded. Ensure the image is clear and undamaged.'
    }


# ═══════════════════════════════════════════════════════════════
#  KEEP-ALIVE (prevents Render free tier from sleeping)
# ═══════════════════════════════════════════════════════════════

def _keep_alive():
    time.sleep(60)
    backend_url = os.environ.get('RENDER_EXTERNAL_URL', f'http://localhost:{PORT}')
    while True:
        try:
            req_lib.get(f'{backend_url}/health', timeout=10)
            log.info("Keep-alive ping sent")
        except Exception:
            pass
        time.sleep(840)

threading.Thread(target=_keep_alive, daemon=True).start()


# ═══════════════════════════════════════════════════════════════
#  RUN
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════╗
║          QR SHIELD — Backend v2.1                ║
╠══════════════════════════════════════════════════╣
║  Health:  http://localhost:{PORT}/health           ║
║  Analyze: POST http://localhost:{PORT}/analyze     ║
╠══════════════════════════════════════════════════╣
║  Claude AI:    {'✅ ON' if ANTHROPIC_KEY  else '❌ OFF — set ANTHROPIC_API_KEY'}
║  VirusTotal:   {'✅ ON' if VIRUSTOTAL_KEY else '❌ OFF — set VIRUSTOTAL_API_KEY'}
║  Secret auth:  {'✅ ON' if FRONTEND_SECRET else '⚠️  OFF — set QRSHIELD_SECRET'}
║  Rate limit:   {RATE_LIMIT_MAX} req / {RATE_LIMIT_WIN}s per IP
╚══════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
