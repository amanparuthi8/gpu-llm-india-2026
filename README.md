# GPU & LLM Infrastructure Advisor — India 2026

> **Local app · zero cloud dependency · uses your existing Claude Pro or ChatGPT Plus**  
> March 2026 · All prices in INR · 1 USD = ₹86.5

---

## What This Is

A local desktop app that takes your workload requirements and recommends the right GPU/LLM infrastructure — from a ₹57,900 Mac Mini to a ₹43-lakh production cluster to India-sovereign cloud. It uses your existing Claude Pro or ChatGPT Plus subscription to generate the recommendation, so you don't need to buy a separate API key.

---

## Quick Start

### Mac / Linux
```bash
bash launch.sh
```
Or double-click `launch.sh` from Finder.

### Windows
Double-click `launch.bat`

The launcher will:
1. Check for Node.js v18+
2. If missing — ask your permission, then install it automatically
3. Start the server at `http://localhost:3131`
4. Open your browser automatically

---

## File Structure

```
gpu-advisor/
├── launch.sh          ← Mac/Linux launcher (double-click or bash launch.sh)
├── launch.bat         ← Windows launcher (double-click)
├── server.js          ← Node.js backend (zero npm deps — pure built-ins)
├── package.json       ← Metadata only, no dependencies
└── public/
    └── index.html     ← Full UI (auth + advisor form + results)
```

---

## Auth Options

### Option 1 — Claude Pro (setup-token)

Requires the `claude` CLI to be installed.

**How it works:**
1. App shows you a terminal command: `claude setup-token`
2. You run it in your terminal
3. CLI prints: `export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-st01-xxxxxxx...`
4. Copy **just the token value** — `sk-ant-st01-xxxxxxx...` — not the `export` line
5. Paste it into the app
6. Server uses `Authorization: Bearer <token>` to call `api.anthropic.com`

**Install claude CLI if you don't have it:**
```bash
npm install -g @anthropic-ai/claude-code
```

**Token lifetime:** ~1 hour. After expiry, run `claude setup-token` again.

---

### Option 2 — ChatGPT Plus (OAuth)

No CLI needed. Full browser-based OAuth flow.

**How it works:**
1. Click "Open ChatGPT Sign-in"
2. Server generates PKCE verifier + challenge, builds auth URL
3. New browser tab opens at `auth.openai.com`
4. You sign in with your OpenAI account
5. OpenAI redirects to `http://localhost:3131/auth/callback`
6. Server exchanges the code for an access token (server-side, never touches browser)
7. Token stored in memory, browser redirected back to advisor

**Uses:** `api.openai.com/v1/chat/completions` with `gpt-4o`

---

### Option 3 — API Key (BYOK)

Paste any Anthropic or OpenAI API key. Stored in memory only — never written to disk.

- Claude API keys: `sk-ant-api03-...`
- OpenAI API keys: `sk-...`

---

## How the Recommendation Works

Once authenticated, you fill in:

| Field | Options |
|-------|---------|
| Expected Run Time | Ad-hoc / Fixed hours/day (slider 1–24h) / 24x7 Always-on |
| Concurrent users | 1 / 2-5 / 10-25 / 25+ |
| Primary use case | Inference · Fine-tuning · RAG · Edge AI · Research · Multimodal · Agentic · Education |
| Model size | ≤3B / 7B / 13-30B / 70B / 100B+ |
| Data sovereignty | India-only (DPDP/BFSI) / Prefer India / No restriction |
| Budget | None / Monthly cap / One-time CapEx |
| CUDA required | Yes / No / Either |
| Deployment | On-premise / Cloud / Hybrid |

The server sends this to Claude Sonnet 4.6 or GPT-4o with a structured prompt referencing all current India 2026 hardware prices.

**Response structure:**
- ⚡ Top recommendation + rationale
- 🏆 Why it fits your specific requirements
- 💰 Monthly + annual cost in INR
- ⚙️ Key optimisations (INT4 quant / Dynamo 1.0 / KV cache / IndiaAI subsidy)
- 🔄 Two alternatives in a table
- ⚠️ Gotchas for your setup

---

## Hardware Database (baked into prompt)

### On-premise devices

| Device | VRAM | Price (INR) | Best For |
|--------|------|-------------|----------|
| Raspberry Pi 5 + AI Kit | 8 GB | ~₹7,200 | Education only |
| Jetson Orin Nano Super 8GB | 8 GB | ~₹21,600 | Budget edge AI |
| Mac Mini M4 16GB | 16 GB unified | ₹57,900 | Personal 7B |
| Mac Mini M4 Pro 64GB | 64 GB unified | ₹1,69,900 | Solo dev 30B |
| Minisforum MS-S1 Max | 128 GB unified | ~₹1,75,000 | AMD Strix Halo, dual 10GbE |
| Jetson AGX Thor 128GB | 128 GB unified | ~₹2,16,250 | Edge AI / Robotics |
| HP ZGX Nano G1n | 128 GB unified | ~₹2,59,500 | GB10, ZGX Toolkit |
| MSI EdgeXpert MS-C931 | 128 GB unified | ~₹2,59,500 | GB10, cheapest |
| ASUS Ascent GX10 | 128 GB unified | ~₹3,02,500 | GB10, best cooling |
| Dell Pro Max GB10 | 128 GB unified | ~₹3,46,000 | GB10, enterprise |
| NVIDIA DGX Spark | 128 GB LPDDR5X | ₹4,06,454 | GB10, reference |
| Mac Studio M4 Max 128GB | 128 GB unified | ~₹4,19,000 | Silent 70B |
| TAALAS 10x RTX 4090 | 240 GB GDDR6X | ₹38-43 lakhs | Production 25 users |

### India cloud (100% sovereign)

| Provider | Rate (INR/hr) | Notes |
|----------|--------------|-------|
| Yotta Shakti | ₹115-400 | IndiaAI subsidy ₹115/hr available |
| E2E Networks | ₹150-250 | Per-minute billing |
| Jio Cloud | ₹200-350 | Azure-backed, GH200 |
| Sify CloudInfinit+AI | ₹200-380 | DGX-Ready certified |
| Tata Communications | ₹220-400 | Blackwell roadmap 2026 |
| CDAC / PARAM Rudra | ₹115-150 | Research only, 40-100% subsidy |

### Global cloud

| Provider | Rate (INR/hr/GPU) | Break-even vs DGX Spark |
|----------|------------------|------------------------|
| Oracle Cloud | ₹108 | 5.2 months |
| Vast.ai | ₹162 | 3.5 months |
| RunPod | ₹172 | 3.3 months |
| Lambda Labs | ₹259 | 2.2 months |
| GCP A3-High | ₹260 | 2.2 months |
| AWS p5.48xlarge | ₹340 | 1.7 months |
| CoreWeave | ₹533 | 1.1 months |
| Azure NC H100 v5 | ₹604 | 0.9 months |

---

## Node.js Auto-Install Logic

| Platform | Methods tried (in order) |
|----------|--------------------------|
| macOS | Homebrew → nvm → official .pkg installer |
| Linux | apt (NodeSource) → dnf → yum → pacman → nvm |
| Windows | winget → PowerShell MSI download |

---

## Privacy & Security

| Concern | What this app does |
|---------|-------------------|
| Token storage | RAM only — nothing written to disk |
| Logging | Errors to terminal only — no request logging |
| On exit | All session tokens cleared |
| Browser storage | `sessionStorage` only (tab-scoped, not `localStorage`) |
| Network binding | `127.0.0.1` only — not accessible from network |
| Dependencies | Zero npm packages — pure Node.js built-ins only |

---

## Troubleshooting

**"Failed to fetch" on any button**  
Server is not running. Re-run `bash launch.sh` or `node server.js`.

**Claude: "Token format invalid"**  
Copy only the token from `claude setup-token` output:  
✓ `sk-ant-st01-xxxx...`  
✗ `export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-st01-xxxx...`

**Claude: session expired mid-use**  
Setup-tokens last ~1 hour. Run `claude setup-token` again. Or use an API key which has no expiry.

**ChatGPT: OAuth fails or blank screen**  
The OAuth client ID may not have localhost registered with OpenAI's Auth0. Use the API key option instead — get a key from [platform.openai.com](https://platform.openai.com).

**Port 3131 already in use**
```bash
# Mac/Linux
lsof -ti:3131 | xargs kill
# Windows
netstat -ano | findstr :3131
taskkill /PID <pid> /F
```

---

## Requirements

- Node.js v18+ (auto-installed by launcher if missing)
- Internet connection
- One of: Claude Pro + `claude` CLI · ChatGPT Plus · Any API key

---

## Related Files in This Project

| File | Contents |
|------|----------|
| `GPU_LLM_Infrastructure_India_2026_v3.docx` | Full 17-platform comparison report with all tables |
| `advisor/index.html` | Standalone static advisor (no auth, client-side scoring only) |
| `GPU_LLM_Infrastructure_India_2026_v3.docx` | Section 0: VRAM-first selection framework |

---

*Prices as of March 2026. Cloud GPU prices are highly dynamic — verify before procurement.*  
*IndiaAI Mission subsidised rates apply only to eligible Indian entities building foundation AI models.*  
*Apply at [indiaai.gov.in](https://indiaai.gov.in)*
