#!/usr/bin/env node
/**
 * GPU & LLM Infrastructure Advisor — Local Server
 * Handles Claude Pro setup-token, ChatGPT PKCE OAuth, and API proxying.
 * Zero npm dependencies — pure Node.js built-ins only.
 */

const http        = require('http');
const https       = require('https');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const { exec }    = require('child_process');
const url         = require('url');
const querystring = require('querystring');

const PORT       = 3131;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Anthropic ─────────────────────────────────────────────────────────────────
// Claude Pro uses `claude setup-token` CLI flow — no browser OAuth exists.
// Token format: sk-ant-st01-<base64url>
// Auth header:  Authorization: Bearer <token>  (NOT x-api-key)
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ── OpenAI / ChatGPT Plus ─────────────────────────────────────────────────────
// PKCE OAuth via auth.openai.com with the public ChatGPT app client ID.
const OPENAI_CLIENT_ID = 'app_EMaOOvSrPo4A8cT09XJXO5';
const OPENAI_AUTH_URL  = 'https://auth.openai.com/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_API_URL   = 'https://api.openai.com/v1/chat/completions';
const OPENAI_SCOPE     = 'openid email profile offline_access model.request model.read organization.read organization.write';
const OPENAI_AUDIENCE  = 'https://api.openai.com/v1';

// ── In-memory sessions (nothing written to disk) ──────────────────────────────
const sessions = new Map();

// ── PKCE helpers ──────────────────────────────────────────────────────────────
const genVerifier  = () => crypto.randomBytes(32).toString('base64url');
const genChallenge = (v) => crypto.createHash('sha256').update(v).digest('base64url');
const genState     = () => crypto.randomBytes(16).toString('hex');
const genSession   = () => crypto.randomBytes(20).toString('hex');

// ── Token format validators ───────────────────────────────────────────────────
function isValidSetupToken(t) {
  // claude setup-token output: sk-ant-st01-<base64url chars>
  return typeof t === 'string' && /^sk-ant-st01-[A-Za-z0-9_-]{20,}$/.test(t.trim());
}
function isValidApiKey(t) {
  const s = (t || '').trim();
  return /^sk-ant-api03-/.test(s) || /^sk-[A-Za-z0-9]{20,}/.test(s);
}

// ── Open browser cross-platform ───────────────────────────────────────────────
function openBrowser(target) {
  const cmd = process.platform === 'darwin' ? `open "${target}"` :
              process.platform === 'win32'  ? `start "" "${target}"` :
              `xdg-open "${target}"`;
  exec(cmd, () => {});
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function sendJSON(res, status, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length':              Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function httpsPost(urlStr, bodyStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const buf    = Buffer.from(bodyStr);
    const req    = https.request({
      hostname: parsed.hostname, port: 443,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  { 'Content-Length': buf.length, ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try   { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /auth/start  { provider: 'claude' | 'chatgpt' }
async function handleAuthStart(req, res) {
  try {
    const data = JSON.parse(await readBody(req));

    if (data.provider === 'claude') {
      const sessionId = genSession();
      sessions.set(sessionId, { provider: 'claude', tokens: null });
      return sendJSON(res, 200, { sessionId, flow: 'paste' });
    }

    if (data.provider === 'chatgpt') {
      const sessionId = genSession();
      const verifier  = genVerifier();
      const challenge = genChallenge(verifier);
      const state     = genState();

      sessions.set(sessionId, { provider: 'chatgpt', verifier, state, tokens: null });

      const params = new URLSearchParams({
        response_type:         'code',
        client_id:             OPENAI_CLIENT_ID,
        redirect_uri:          `http://localhost:${PORT}/auth/callback`,
        scope:                 OPENAI_SCOPE,
        code_challenge:        challenge,
        code_challenge_method: 'S256',
        state:                 `${sessionId}:${state}`,
        audience:              OPENAI_AUDIENCE,
      });

      return sendJSON(res, 200, {
        sessionId,
        flow:    'browser',
        authUrl: `${OPENAI_AUTH_URL}?${params}`,
      });
    }

    sendJSON(res, 400, { error: 'Unknown provider.' });

  } catch (err) {
    console.error('[/auth/start]', err);
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /auth/token  { sessionId, token }  — Claude setup-token paste
async function handleAuthToken(req, res) {
  try {
    const data    = JSON.parse(await readBody(req));
    const session = sessions.get(data.sessionId);
    if (!session) return sendJSON(res, 404, { error: 'Session not found. Reload and try again.' });

    const token = (data.token || '').trim();
    if (!token) return sendJSON(res, 400, { error: 'Token is empty.' });

    if (!isValidSetupToken(token)) {
      return sendJSON(res, 400, {
        error: `Token format invalid. Expected: sk-ant-st01-<long string>. ` +
               `Copy the FULL token printed by "claude setup-token" — not the export command, just the token value.`,
      });
    }

    session.tokens = { access: token, isOAuth: true, expires: Date.now() + 3600 * 1000 };
    sendJSON(res, 200, { authed: true });

  } catch (err) {
    console.error('[/auth/token]', err);
    sendJSON(res, 500, { error: err.message });
  }
}

// GET /auth/callback  — ChatGPT OAuth redirect
async function handleAuthCallback(req, res) {
  try {
    const q = url.parse(req.url, true).query;

    if (q.error) return res.end(callbackPage('error', `OAuth denied: ${q.error}`));

    const [sessionId, stateToken] = (q.state || '').split(':');
    const session = sessions.get(sessionId);

    if (!session || session.state !== stateToken) {
      return res.end(callbackPage('error', 'State mismatch. Please try again.'));
    }

    const body = querystring.stringify({
      grant_type:    'authorization_code',
      code:          q.code,
      redirect_uri:  `http://localhost:${PORT}/auth/callback`,
      client_id:     OPENAI_CLIENT_ID,
      code_verifier: session.verifier,
    });

    const r = await httpsPost(OPENAI_TOKEN_URL, body, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (r.status !== 200 || !r.body?.access_token) {
      console.error('[/auth/callback] token exchange failed:', r.status, r.body);
      return res.end(callbackPage('error',
        `Token exchange failed (${r.status}): ${r.body?.error_description || JSON.stringify(r.body).slice(0, 200)}`
      ));
    }

    session.tokens = {
      access:  r.body.access_token,
      refresh: r.body.refresh_token,
      expires: Date.now() + (r.body.expires_in || 3600) * 1000,
    };

    res.writeHead(302, { Location: `/?session=${sessionId}&provider=chatgpt&authed=1` });
    res.end();

  } catch (err) {
    console.error('[/auth/callback]', err);
    res.end(callbackPage('error', err.message));
  }
}

// POST /auth/status  { sessionId }
async function handleAuthStatus(req, res) {
  try {
    const data    = JSON.parse(await readBody(req));
    const session = sessions.get(data.sessionId);
    if (!session) return sendJSON(res, 200, { authed: false });
    sendJSON(res, 200, {
      authed:   !!session.tokens,
      provider: session.provider,
      expired:  session.tokens ? session.tokens.expires < Date.now() : false,
    });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/byok  { provider, apiKey }
async function handleBYOK(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const key  = (data.apiKey || '').trim();

    if (!key) return sendJSON(res, 400, { error: 'API key is empty.' });
    if (!isValidApiKey(key)) return sendJSON(res, 400, {
      error: 'Key format invalid. Claude keys start with sk-ant-api03-, OpenAI keys start with sk-.',
    });

    const sessionId = genSession();
    sessions.set(sessionId, {
      provider: data.provider || 'claude',
      tokens:   { access: key, isApiKey: true, expires: Date.now() + 86400000 },
    });
    sendJSON(res, 200, { sessionId, authed: true });

  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/recommend  { sessionId, requirements }
async function handleRecommend(req, res) {
  try {
    const data    = JSON.parse(await readBody(req));
    const session = sessions.get(data.sessionId);

    if (!session?.tokens) return sendJSON(res, 401, { error: 'Not authenticated.' });
    if (session.tokens.expires < Date.now()) return sendJSON(res, 401, { error: 'Session expired. Sign in again.' });

    const token  = session.tokens.access;
    const isKey  = !!session.tokens.isApiKey;
    const prompt = buildPrompt(data.requirements);

    let result;
    if (session.provider === 'chatgpt') {
      result = await callOpenAI(token, prompt);
    } else {
      result = await callClaude(token, prompt, isKey);
    }

    sendJSON(res, 200, { recommendation: result });

  } catch (err) {
    console.error('[/api/recommend]', err);
    sendJSON(res, 500, { error: err.message });
  }
}

// ── Anthropic API ─────────────────────────────────────────────────────────────
function callClaude(token, prompt, isApiKey) {
  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6', max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  // setup-token (OAuth) → Authorization: Bearer <token>
  // direct API key      → x-api-key: <key>
  const authHeaders = isApiKey
    ? { 'x-api-key': token }
    : { 'Authorization': `Bearer ${token}` };

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(payload),
        ...authHeaders,
      },
    }, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          if (json.error) return reject(new Error(`Anthropic error: ${json.error.message || JSON.stringify(json.error)}`));
          const text = json.content?.[0]?.text;
          if (text) return resolve(text);
          reject(new Error(`No content in response: ${raw.slice(0, 200)}`));
        } catch { reject(new Error(`Parse error: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── OpenAI API ────────────────────────────────────────────────────────────────
function callOpenAI(token, prompt) {
  const payload = JSON.stringify({
    model: 'gpt-4o', max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com', port: 443,
      path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          if (json.error) return reject(new Error(`OpenAI error: ${json.error.message || JSON.stringify(json.error)}`));
          const text = json.choices?.[0]?.message?.content;
          if (text) return resolve(text);
          reject(new Error(`No content in response: ${raw.slice(0, 200)}`));
        } catch { reject(new Error(`Parse error: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Recommendation prompt ─────────────────────────────────────────────────────
function buildPrompt(r) {
  return `You are a GPU and LLM infrastructure expert for Indian AI developers (March 2026, 1 USD = ₹86.5).

User requirements:
- Usage: ${r.usage || 'unspecified'} ${r.hours ? `(${r.hours} hrs/day)` : ''}
- Concurrent users: ${r.users || 'unspecified'}
- Use case: ${r.projectType || 'unspecified'}
- Model size: ${r.modelSize || 'unspecified'}
- Data sovereignty: ${r.sovereignty || 'no restriction'}
- Budget: ${r.budget || 'no limit'}
- CUDA required: ${r.cuda || 'no preference'}
- Deployment: ${r.deploy || 'hybrid'}

Respond in this exact structure:

## ⚡ Top Recommendation
[Single best option · price in INR · 2-3 sentence rationale]

## 🏆 Why This Fits
- [requirement match 1]
- [requirement match 2]
- [cost fit]

## 💰 Cost Estimate
[Monthly + annual in INR]

## ⚙️ Key Optimisations
[2-3 specific techniques e.g. INT4 quantization saves 4-8× VRAM, Dynamo 1.0 free 7× boost, IndiaAI subsidy ₹115/hr]

## 🔄 Alternatives
| Option | Price (INR) | Tradeoff |
|--------|------------|----------|
| ...    | ...        | ...      |

## ⚠️ Watch Out For
[1-2 gotchas]

Reference prices: DGX Spark ₹4,06,454 · ASUS GX10 ₹3,02,500 · MSI EdgeXpert ₹2,59,500 · Dell Pro Max GB10 ~₹3,46,000 · HP ZGX Nano ~₹2,59,500 · Mac Mini M4 Pro 64GB ₹1,69,900 · Mac Studio M4 Max ₹4,19,000 · Minisforum MS-S1 Max ~₹1,75,000 · Jetson AGX Thor ₹2,16,250 · Jetson Orin Nano Super ₹21,600 · TAALAS 10×RTX4090 ₹38-43L · Yotta Shakti ₹115-400/hr · E2E Networks ₹150-250/hr · Oracle Cloud ₹108/hr/GPU · AWS p5 ₹340/hr · GCP A3 ₹260/hr`;
}

// ── OAuth callback page ───────────────────────────────────────────────────────
function callbackPage(status, msg) {
  const ok = status !== 'error';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ok ? 'Signed in' : 'Error'}</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{background:#111827;border:1px solid rgba(99,179,237,.2);border-radius:16px;padding:40px;text-align:center;max-width:440px}
h2{color:${ok ? '#68d391' : '#fc8181'};margin:0 0 12px}p{color:#718096;font-size:14px;margin:0 0 24px}
button{background:linear-gradient(135deg,#2b6cb0,#1a4f8a);color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:14px;cursor:pointer}</style>
</head><body><div class="c">
<h2>${ok ? '✓ Signed in!' : '✗ Error'}</h2>
<p>${msg || (ok ? 'You can close this tab and return to the advisor.' : 'Something went wrong.')}</p>
<button onclick="window.close()">Close tab</button>
</div>${ok ? '<script>setTimeout(()=>window.close(),1500)</script>' : ''}</body></html>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  if (pathname === '/auth/start'    && req.method === 'POST') return handleAuthStart(req, res);
  if (pathname === '/auth/token'    && req.method === 'POST') return handleAuthToken(req, res);
  if (pathname === '/auth/callback' && req.method === 'GET' ) return handleAuthCallback(req, res);
  if (pathname === '/auth/status'   && req.method === 'POST') return handleAuthStatus(req, res);
  if (pathname === '/api/byok'      && req.method === 'POST') return handleBYOK(req, res);
  if (pathname === '/api/recommend' && req.method === 'POST') return handleRecommend(req, res);

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
  }
  const safe = path.resolve(PUBLIC_DIR, pathname.replace(/^\//, ''));
  if (!safe.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(safe)) {
    const mime = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(safe)] || 'text/plain';
    return serveFile(res, safe, mime);
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n  ╔═══════════════════════════════════════════╗');
  console.log(`  ║  GPU & LLM Infrastructure Advisor         ║`);
  console.log(`  ║  http://localhost:${PORT}                    ║`);
  console.log('  ╚═══════════════════════════════════════════╝\n');
  setTimeout(() => openBrowser(`http://localhost:${PORT}`), 600);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  Port ${PORT} is busy — app may already be running.`);
    console.log(`  Open http://localhost:${PORT} in your browser.\n`);
    openBrowser(`http://localhost:${PORT}`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

// Prevent crashes from killing server
process.on('uncaughtException',  (e) => console.error('[uncaught]', e.message));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('SIGINT',  () => { console.log('\n  Bye!'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
