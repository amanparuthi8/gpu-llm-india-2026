# GPU & LLM Infrastructure Advisor
### India 2026 · All prices in INR · 1 USD = ₹86.5

A local desktop app that recommends the right GPU or cloud infrastructure for your AI workload. Works in two modes — instant dataset-based scoring with no account required, or AI-powered analysis using your existing Claude Pro or ChatGPT Plus subscription.

---

## Quick Start

**Mac / Linux**
```bash
bash launch.sh
```

**Windows**
```
Double-click launch.bat
```

The launcher checks for Node.js v18+, installs it automatically if missing (with your permission), starts the server on `http://localhost:3131`, and opens your browser.

No npm install. No dependencies. Pure Node.js built-ins only.

---

## Two Modes

### ⚡ Dataset Mode — no account needed

Click **"Skip sign-in — get instant dataset recommendations"** on the auth screen.

The scoring engine evaluates all 17 platforms against your requirements entirely in the browser — no server call, no AI, instant results. You get:

- Top 4 ranked platforms with a match score out of 100
- 8 metrics per platform: token speed, monthly cost, annual cost, max model size, power draw, concurrent users, CUDA support, cooling
- Pros, cons, and sovereignty tags on every card
- Up to 4 context-aware optimisation tips on the top pick (INT4 quant, Dynamo 1.0, IndiaAI subsidy, etc.)

### 🤖 AI Mode — Claude Pro or ChatGPT Plus

Sign in with your existing subscription (no new API key purchase). The server sends your requirements to Claude Sonnet 4.6 or GPT-4o with full India 2026 pricing context and returns a structured recommendation with rationale, cost breakdown, alternatives, and gotchas.

If the AI call fails for any reason, the app automatically falls back to dataset mode.

---

## Auth Options

### Claude Pro — setup-token

1. Open your terminal and run `claude setup-token`
2. Copy the token it prints — it looks like `sk-ant-st01-xxxxxxxxx...`
3. Paste only that token value (not the `export` line) into the app

Requires the `claude` CLI: `npm install -g @anthropic-ai/claude-code`

Tokens are valid for ~1 hour. Run `claude setup-token` again when it expires.

### ChatGPT Plus — OAuth

Click "Open ChatGPT Sign-in". A browser tab opens at `auth.openai.com`. You sign in normally. OpenAI redirects back to `localhost:3131`, the server exchanges the code for a token, and you're in. Nothing is stored to disk.

### API Key (BYOK)

Paste any Anthropic or OpenAI API key directly. Stored in memory for the session only.

- Claude keys: `sk-ant-api03-...`
- OpenAI keys: `sk-...`

---

## The Advisor Form

| Field | Options |
|-------|---------|
| Expected run time | ⚡ Ad-hoc / 🕐 Fixed hours/day (slider 1–24h) / ♾️ 24×7 Always-on |
| Concurrent users | 1 · 2–5 · 10–25 · 25+ |
| Primary use case | Inference · Fine-tuning · RAG · Edge AI · Research · Multimodal · Agentic · Education |
| Target model size | ≤3B · 7B · 13–30B · 70B · 100B+ |
| Data sovereignty | 🇮🇳 India-only (DPDP/BFSI) · Prefer India · No restriction |
| Budget | No limit · Monthly cap (₹) · One-time CapEx (₹) |
| CUDA required | Yes · No · Either |
| Deployment | On-premise · Cloud · Hybrid |

---

## Hardware Database (17 Platforms)

### On-Premise Devices

| Device | VRAM | Price (INR) | Max Model | CUDA |
|--------|------|-------------|-----------|------|
| Raspberry Pi 5 + AI Kit | 8 GB | ₹7,200 | 3B | ✗ |
| Jetson Orin Nano Super 8GB | 8 GB | ₹21,600 | 8B | ✓ |
| Mac Mini M4 (16 GB) | 16 GB unified | ₹57,900 | 7B INT4 | ✗ |
| Mac Mini M4 Pro (64 GB) | 64 GB unified | ₹1,69,900 | 30B INT4 | ✗ |
| AMD Strix Halo Mini PCs (128 GB) | 128 GB unified | ~₹1,75,000 | 70B INT4 | ✗ |
| NVIDIA Jetson AGX Thor | 128 GB unified | ₹2,16,250 | 70B FP8 | ✓ |
| HP ZGX Nano G1n (GB10) | 128 GB LPDDR5X | ~₹2,59,500 | 200B FP4 | ✓ |
| MSI EdgeXpert MS-C931 (GB10) | 128 GB LPDDR5X | ~₹2,59,500 | 200B FP4 | ✓ |
| ASUS Ascent GX10 (GB10) | 128 GB LPDDR5X | ~₹3,02,500 | 200B FP4 | ✓ |
| Dell Pro Max GB10 | 128 GB LPDDR5X | ~₹3,46,000 | 200B FP4 | ✓ |
| NVIDIA DGX Spark (GB10) | 128 GB LPDDR5X | ₹4,06,454 | 200B FP4 | ✓ |
| Mac Studio M4 Max (128 GB) | 128 GB unified | ~₹4,19,000 | 70B INT4 | ✗ |
| TAALAS 10× RTX 4090 | 240 GB GDDR6X | ₹38–43 lakhs | 130B INT4 | ✓ |

**GB10 family note:** ASUS GX10, MSI EdgeXpert, Dell Pro Max, HP ZGX Nano, and NVIDIA DGX Spark all run the identical GB10 Grace Blackwell chip (1 PFLOP FP4, 128 GB, 273 GB/s). They differ only in thermal design, storage options, software bundle, and price. MSI is the cheapest; Dell has the best thermals; ASUS has the best cooling design; HP has the best software stack.

### India Cloud (100% Data Sovereign)

| Provider | Rate (INR/hr) | GPU | IndiaAI Subsidy |
|----------|--------------|-----|-----------------|
| Yotta Shakti | ₹115–400 | H100 / GH200 / B200 | ✓ ₹115/hr eligible |
| E2E Networks | ₹150–250 | H100 Hopper | ✓ empanelled |
| Jio Cloud | ₹200–350 | GH200 | ✓ empanelled |
| Sify CloudInfinit+AI | ₹200–380 | H100 / H200 | ✓ empanelled |
| Tata Communications | ₹220–400 | Hopper + Blackwell | ✓ empanelled |
| CDAC / PARAM Rudra | ₹115–150 | H100 / A100 / MI300X | Core provider — research only |

IndiaAI Mission subsidised compute: eligible Indian startups building foundation AI models get H100/GH200 at ₹115–150/hr (vs ₹250–400 full rate). Apply at [indiaai.gov.in](https://indiaai.gov.in).

### Global Cloud

| Provider | Rate (INR/hr/GPU) | Break-even vs DGX Spark |
|----------|------------------|------------------------|
| Oracle Cloud | ₹108 | 5.2 months |
| RunPod | ₹172 | 3.3 months |
| GCP A3-High | ₹260 | 2.2 months |
| AWS p5.48xlarge | ₹340 | 1.7 months |
| Azure NC H100 v5 | ₹604 | 0.9 months |

---

## Scoring Logic (Dataset Mode)

The engine applies hard disqualifiers first, then scores positively:

**Hard disqualifiers** — any of these returns a score of -1 (platform excluded):
- Platform's max model size is smaller than the requested model
- India-only sovereignty requested but provider is not India-sovereign
- CUDA required but platform has no CUDA
- On-premise only but platform is cloud (or vice versa)
- Platform's max concurrent users is less than requested
- Budget exceeded (monthly or CapEx)

**Positive scoring** — points added for:
- India sovereignty match when requested (+30)
- Prefer-India match (+15)
- CUDA available when preferred (+8)
- Users headroom (2× or more capacity) (+12)
- Budget under 60% of cap (+8)
- Correct usage pattern (ad-hoc → cloud +20, 24×7 → on-prem +18)
- Project type in platform's `bestFor` list (+25)
- Model size headroom at 120B+ (+20)
- Token speed bonus (up to +18)
- Specific boosts: Jetson Thor for Edge AI (+30), Jetson Nano for budget edge (+25), RPi for education (+30), CUDA platforms for fine-tuning (+12)

**Optimisation tips** are matched to the form inputs — e.g. IndiaAI subsidy tip only appears when India sovereignty is selected, INT4 quantization tip appears for 30B+ models, Dynamo 1.0 tip appears for multi-user or agent workloads.

---

## File Structure

```
gpu-advisor/
├── launch.sh          ← Mac/Linux launcher
├── launch.bat         ← Windows launcher
├── server.js          ← Node.js backend (zero npm dependencies)
├── package.json       ← Metadata only
├── README.md          ← This file
├── OAUTH.md           ← Detailed OAuth flow documentation
└── public/
    └── index.html     ← Full app UI (auth + form + dataset engine + results)
```

---

## Node.js Auto-Install

| Platform | Install methods tried (in order) |
|----------|----------------------------------|
| macOS | Homebrew → nvm → official .pkg |
| Linux | apt/NodeSource → dnf → yum → pacman → nvm |
| Windows | winget → PowerShell MSI download |

---

## Privacy

- Tokens stored in RAM only — nothing written to disk
- No request logging — errors print to terminal only
- All tokens cleared on app exit (Ctrl+C or closing the terminal)
- Browser stores only the session ID in `sessionStorage` (tab-scoped, cleared on tab close)
- Server binds to `127.0.0.1` only — not reachable from your network
- Zero npm packages — no supply chain risk

---

## Troubleshooting

**"Failed to fetch" on any button**
The server isn't running. Re-run `bash launch.sh` or `node server.js` in the project folder.

**Claude: "Token format invalid"**
Copy only the token value — not the full export line.
```
✓  sk-ant-st01-xxxxxxxxxxxxxxxx...
✗  export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-st01-xxxxxxx...
```

**Claude: session expired**
Setup-tokens last ~1 hour. Run `claude setup-token` again and paste the new token. Or switch to an API key which has no expiry.

**ChatGPT: OAuth fails or blank screen**
Use the API key option instead — create a key at [platform.openai.com](https://platform.openai.com).

**Port 3131 already in use**
```bash
# Mac/Linux
lsof -ti:3131 | xargs kill

# Windows
netstat -ano | findstr :3131
taskkill /PID <pid> /F
```

**Want recommendations without signing in?**
Click **"Skip sign-in — get instant dataset recommendations"** on the auth screen.

---

## Requirements

- Node.js v18+ (auto-installed by launcher if missing)
- Internet connection (for OAuth and AI API calls — dataset mode works offline)
- For AI mode: Claude Pro + `claude` CLI, or ChatGPT Plus, or any API key

---

*Prices as of March 2026. Cloud GPU rates are dynamic — verify before procurement.*
*Full research report with all benchmarks and comparison tables: `GPU_LLM_Infrastructure_India_2026_v3.docx`*
