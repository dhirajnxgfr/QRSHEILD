# 🛡️ QR Shield — Stop QR Fraud Before It Starts

> Real-time QR code threat detection powered by Claude AI + VirusTotal. Open-source, fast, and built for the security-conscious.

![QR Shield Banner](https://img.shields.io/badge/QR%20Shield-v2.1-00ffe0?style=for-the-badge&labelColor=030811)
![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.x-black?style=for-the-badge&logo=flask)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet-orange?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🔍 What is QR Shield?

QR Shield is a full-stack security tool that analyzes any QR code or URL for threats in real-time. It combines multiple detection layers to deliver a clear **SAFE / WARN / DANGER** verdict with a 0–100 risk score.

### Detection Pipeline

```
QR Image / URL
      │
      ▼
┌─────────────────────┐
│   QR Decoder        │  OpenCV + pyzbar (3-method fallback)
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│  8 Heuristic Checks │  Typosquatting · Suspicious TLD · Redirect chains
│                     │  Obfuscation · Brand impersonation · HTTPS safety
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   Claude AI         │  Deep semantic analysis + natural language summary
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│   VirusTotal        │  90+ security engines, live threat intel
└─────────────────────┘
      │
      ▼
  Risk Score 0–100
  SAFE / WARN / DANGER
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **QR Decoding** | pyzbar + OpenCV with 3-method fallback for damaged codes |
| 🧠 **Claude AI Analysis** | Semantic threat detection with plain-English summary |
| 🛡️ **VirusTotal Integration** | Cross-checked against 90+ antivirus engines |
| 📊 **Risk Scoring** | Composite 0–100 score → SAFE / WARN / DANGER verdict |
| 🔐 **Secret Key Auth** | Backend protected with shared secret header |
| ⚡ **Rate Limiting** | Per-IP rate limiting to prevent abuse |
| 📱 **Android App** | Native Kotlin app with live camera scanning |
| 🌙 **Dark UI** | Cyberpunk-themed frontend, fully responsive |

---

## 🚀 Live Demo

**Frontend:** [qr-shield.vercel.app](https://qrshield.vercel.app)  
**Backend:** [qr-shield-backend.onrender.com](https://qrshield-backend.onrender.com/health)

---

## 🗂️ Project Structure

```
QRSHEILD/
├── index.html          # Frontend — landing page + live demo UI
├── style.css           # Cyberpunk dark theme
├── script.js           # Frontend logic + secure backend calls
├── backend.py          # Flask API — QR decode + Claude AI + VirusTotal
├── requirements.txt    # Python dependencies
├── render.yaml         # Render.com deploy config
└── README.md
```

---

## ⚙️ Local Setup

### Prerequisites
- Python 3.10+
- pip
- An [Anthropic API key](https://console.anthropic.com)
- A [VirusTotal API key](https://www.virustotal.com) (free)

### 1. Clone the repo

```bash
git clone https://github.com/dhirajnxgfr/QRSHEILD.git
cd QRSHEILD
```

### 2. Install dependencies

```bash
pip install flask flask-cors anthropic opencv-python pyzbar pillow requests
```

### 3. Set environment variables

**Windows:**
```cmd
set ANTHROPIC_API_KEY=sk-ant-your-key
set VIRUSTOTAL_API_KEY=your-vt-key
set QRSHIELD_SECRET=any-random-string
```

**Mac / Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
export VIRUSTOTAL_API_KEY=your-vt-key
export QRSHIELD_SECRET=any-random-string
```

### 4. Run the backend

```bash
python backend.py
```

Visit `http://localhost:5000/health` to confirm it's running.

### 5. Open the frontend

Open `index.html` directly in your browser, or serve it with:
```bash
python -m http.server 8080
```
Then go to `http://localhost:8080`

---

## 🌐 Deployment

### Backend → Render (free)

1. Go to [render.com](https://render.com) → New Web Service → connect this repo
2. Add environment variables in the **Environment** tab:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `VIRUSTOTAL_API_KEY` | `your-vt-key` |
| `QRSHIELD_SECRET` | `any-random-string` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
| `DEBUG` | `false` |

3. Deploy — Render uses `render.yaml` automatically.

### Frontend → Vercel (free)

1. Go to [vercel.com](https://vercel.com) → New Project → import this repo
2. Framework: **Other** · Root: `/`
3. Deploy

Update `script.js` with your Render URL before deploying:
```js
const BACKEND_URL     = 'https://your-backend.onrender.com';
const QRSHIELD_SECRET = 'your-secret-here';
```

---

## 🔐 Security Model

```
Browser ──── X-QRShield-Secret header ────▶ Flask Backend
                                                  │
                                          ANTHROPIC_API_KEY (env only)
                                          VIRUSTOTAL_API_KEY (env only)
```

- API keys are **never** in source code — only Render environment variables
- Every frontend request must carry the correct `X-QRShield-Secret` header
- Rate limited to **10 scans / 60 seconds per IP** (configurable)
- CORS locked to your Vercel domain in production

---

## 🧪 Test URLs

| Type | URL |
|---|---|
| ✅ Safe | `https://github.com` |
| ⚠️ Warning | `https://bit.ly/suspicious` |
| 🚨 Danger | `http://paypa1-secure-verify.xyz/login` |
| 🚨 Danger | `http://amaz0n-account-update.tk/confirm` |

---

## 📱 Android App

The QR Shield Android app (Kotlin) offers:
- Live camera QR scanning
- Offline heuristic checks
- Full scan history dashboard
- VirusTotal + Safe Browsing when online
- Dark mode, minimal permissions

**Download APK:** Coming soon  
**Source:** See `/android` branch

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML · CSS · Vanilla JS |
| Backend | Python · Flask · Flask-CORS |
| QR Decoding | OpenCV · pyzbar · Pillow |
| AI Analysis | Anthropic Claude Sonnet |
| Threat Intel | VirusTotal API v3 |
| Frontend Host | Vercel |
| Backend Host | Render |
| Mobile | Kotlin · Android |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Dhiraj** — [@dhirajnxgfr](https://github.com/dhirajnxgfr)

---

<div align="center">
  <sub>Built with ❤️ for cybersecurity awareness</sub>
</div>
