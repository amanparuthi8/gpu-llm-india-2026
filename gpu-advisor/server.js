#!/usr/bin/env node
/**
 * GPU & LLM Infrastructure Advisor — Local Server
 * Handles API-key auth for multiple LLM providers, OpenAI Codex OAuth,
 * and local recommendation proxying.
 */

const http        = require('http');
const https       = require('https');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const { exec }    = require('child_process');
const url         = require('url');
const {
  OPENAI_CODEX_BASE_URL,
  GOOGLE_GEMINI_CLI_BASE_URL,
  QWEN_PORTAL_BASE_URL,
  createDeferred,
  startOpenAICodexOAuth,
  refreshOpenAICodexSession,
  startGeminiCliOAuth,
  refreshGeminiCliSession,
  beginQwenDeviceOAuth,
  pollQwenDeviceOAuth,
  refreshQwenOAuthSession,
  normalizeQwenBaseUrl,
} = require('./oauth-providers.js');

const PORT       = 3131;
const PUBLIC_DIR = path.join(__dirname, 'public');

const PROVIDER_CATALOG = {
  anthropic: {
    label: 'Anthropic Claude',
    model: 'claude-sonnet-4-6',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 64000,
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4o',
    api: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
  },
  google: {
    label: 'Google Gemini',
    model: 'gemini-2.5-pro',
    api: 'google-generative-ai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  'google-gemini-cli': {
    label: 'Gemini OAuth',
    model: 'gemini-2.5-pro',
    api: 'google-gemini-cli',
    baseUrl: GOOGLE_GEMINI_CLI_BASE_URL,
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  mistral: {
    label: 'Mistral',
    model: 'mistral-large-latest',
    api: 'openai-completions',
    baseUrl: 'https://api.mistral.ai/v1',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 262144,
    maxTokens: 16384,
  },
  qwen: {
    label: 'Qwen',
    model: 'coder-model',
    api: 'openai-completions',
    baseUrl: 'https://portal.qwen.ai/v1',
    reasoning: false,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 8192,
  },
  kimi: {
    label: 'Kimi',
    model: 'kimi-code',
    api: 'anthropic-messages',
    baseUrl: 'https://api.kimi.com/coding/',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 262144,
    maxTokens: 32768,
    headers: {
      'User-Agent': 'claude-code/0.1.0',
    },
  },
  groq: {
    label: 'Groq',
    model: 'llama-3.3-70b-versatile',
    api: 'openai-completions',
    baseUrl: 'https://api.groq.com/openai/v1',
    reasoning: false,
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 8192,
  },
  deepseek: {
    label: 'DeepSeek',
    model: 'deepseek-chat',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    reasoning: true,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 16384,
  },
};

// ── In-memory sessions (nothing written to disk) ──────────────────────────────
const sessions = new Map();
const oauthFlows = new Map();

const genSession   = () => crypto.randomBytes(20).toString('hex');

// ── Token format validators ───────────────────────────────────────────────────
function isValidApiKey(provider, t) {
  const s = (t || '').trim();
  if (!s) return false;
  switch (provider) {
    case 'anthropic':
      return /^sk-ant-api03-/.test(s) || s.length >= 24;
    case 'openai':
    case 'deepseek':
      return /^sk-[A-Za-z0-9_-]{16,}/.test(s) || s.length >= 20;
    case 'groq':
      return /^gsk_[A-Za-z0-9_-]{16,}/.test(s) || s.length >= 20;
    case 'google':
      return /^AIza[0-9A-Za-z_-]{20,}/.test(s) || s.length >= 20;
    case 'mistral':
    case 'qwen':
    case 'kimi':
      return s.length >= 12;
    default:
      return s.length >= 12;
  }
}

function isValidSetupToken(t) {
  const s = (t || '').trim();
  return /^sk-ant-st01-[A-Za-z0-9_-]{20,}$/.test(s) || s.length >= 32;
}

function buildEmptyCost() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function extractAssistantText(message) {
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const text = blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('No text content returned from Codex OAuth session.');
  }
  return text;
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

async function loadPiAiDeps() {
  const piAi = await import('@mariozechner/pi-ai');
  return piAi;
}

async function resolveSessionAccessToken(session) {
  if (!session?.tokens?.access) {
    throw new Error('Missing session token.');
  }

  if (session.provider === 'google-gemini-cli') {
    if (!session.tokens.projectId) {
      throw new Error('Gemini OAuth session missing project ID. Sign in again.');
    }
    if (session.tokens.refresh && session.tokens.expires < Date.now()) {
      session.tokens = await refreshGeminiCliSession(session.tokens);
    } else if (session.tokens.expires < Date.now()) {
      throw new Error('Gemini OAuth session expired. Sign in again.');
    }
    return JSON.stringify({
      token: session.tokens.access,
      projectId: session.tokens.projectId,
    });
  }

  if (session.provider === 'qwen' && session.authMode === 'oauth') {
    if (session.tokens.refresh && session.tokens.expires < Date.now()) {
      session.tokens = await refreshQwenOAuthSession(session.tokens);
      if (session.tokens.resourceUrl) {
        session.baseUrl = normalizeQwenBaseUrl(session.tokens.resourceUrl);
      }
    } else if (session.tokens.expires < Date.now()) {
      throw new Error('Qwen OAuth session expired. Sign in again.');
    }
    return session.tokens.access;
  }

  if (session.provider !== 'openai-codex') {
    if (session.tokens.expires < Date.now()) {
      throw new Error('Session expired. Sign in again.');
    }
    return session.tokens.access;
  }

  if (!session.tokens.refresh) {
    if (session.tokens.expires < Date.now()) {
      throw new Error('OpenAI Codex session expired. Sign in again.');
    }
    return session.tokens.access;
  }

  const refreshed = await refreshOpenAICodexSession(session.tokens);
  session.tokens = refreshed.tokens;
  return refreshed.apiKey;
}

function buildRuntimeModel(providerId) {
  if (providerId === 'openai-codex') {
    return {
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      provider: 'openai-codex',
      api: 'openai-codex-responses',
      baseUrl: OPENAI_CODEX_BASE_URL,
      reasoning: true,
      input: ['text'],
      cost: buildEmptyCost(),
      contextWindow: 1050000,
      maxTokens: 128000,
    };
  }

  const provider = PROVIDER_CATALOG[providerId];
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }

  return {
    id: provider.model,
    name: provider.model,
    provider: providerId,
    api: provider.api,
    baseUrl: provider.baseUrl,
    reasoning: provider.reasoning,
    input: provider.input,
    cost: buildEmptyCost(),
    contextWindow: provider.contextWindow,
    maxTokens: provider.maxTokens,
    ...(provider.headers ? { headers: provider.headers } : {}),
  };
}

function callAnthropicText(token, prompt, authMode = 'api-key') {
  const payload = JSON.stringify({
    model: PROVIDER_CATALOG.anthropic.model,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const authHeaders =
    authMode === 'setup-token'
      ? { Authorization: `Bearer ${token}` }
      : { 'x-api-key': token };

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload),
        ...authHeaders,
      },
    }, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          if (json.error) {
            return reject(new Error(`Anthropic error: ${json.error.message || JSON.stringify(json.error)}`));
          }
          const text = json.content?.[0]?.text;
          if (text) return resolve(text);
          reject(new Error(`No content in response: ${raw.slice(0, 200)}`));
        } catch {
          reject(new Error(`Parse error: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function completeWithProvider(session, token, prompt) {
  if (session.provider === 'anthropic') {
    return await callAnthropicText(token, prompt, session.authMode || 'api-key');
  }

  const providerId = session.provider;
  const runtimeModel = buildRuntimeModel(providerId);
  if (providerId === 'qwen' && session.baseUrl) {
    runtimeModel.baseUrl = session.baseUrl;
  }
  const { complete } = await loadPiAiDeps();
  const result = await complete(
    runtimeModel,
    {
      messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
    },
    {
      apiKey: token,
      maxTokens: 1500,
      transport: 'auto',
    },
  );

  return extractAssistantText(result);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/gemini/start
async function handleGeminiOAuthStart(_req, res) {
  const flowId = genSession();
  const sessionId = genSession();
  const manualCode = createDeferred();
  const flow = {
    status: 'pending',
    sessionId,
    authUrl: '',
    error: '',
    instructions: '',
    manualCode,
  };
  oauthFlows.set(flowId, flow);

  try {
    void startGeminiCliOAuth({
      openUrl: openBrowser,
      waitForManualCode: async () => await manualCode.promise,
      onAuthUrl: (authUrl) => {
        flow.authUrl = authUrl;
      },
      onInstructions: (instructions) => {
        flow.instructions = instructions || '';
      },
      onProgress: () => {},
    })
      .then((creds) => {
        sessions.set(sessionId, {
          provider: 'google-gemini-cli',
          authMode: 'oauth',
          tokens: {
            access: creds.access,
            refresh: creds.refresh,
            expires: creds.expires,
            projectId: creds.projectId,
            isOAuth: true,
          },
        });
        flow.status = 'complete';
      })
      .catch((err) => {
        flow.status = 'error';
        flow.error = err instanceof Error ? err.message : String(err);
      });

    sendJSON(res, 200, {
      flowId,
      sessionId,
      authUrl: flow.authUrl || null,
      instructions: flow.instructions || null,
    });
  } catch (err) {
    oauthFlows.delete(flowId);
    sendJSON(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

// POST /api/gemini/status
async function handleGeminiOAuthStatus(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const flow = oauthFlows.get(data.flowId);
    if (!flow) return sendJSON(res, 404, { error: 'Gemini OAuth flow not found. Start again.' });
    sendJSON(res, 200, {
      status: flow.status,
      sessionId: flow.status === 'complete' ? flow.sessionId : null,
      authUrl: flow.authUrl || null,
      instructions: flow.instructions || null,
      error: flow.error || null,
    });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/gemini/code
async function handleGeminiOAuthCode(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const flow = oauthFlows.get(data.flowId);
    if (!flow) return sendJSON(res, 404, { error: 'Gemini OAuth flow not found. Start again.' });
    const code = String(data.code || '').trim();
    if (!code) return sendJSON(res, 400, { error: 'Redirect URL is empty.' });
    flow.manualCode.resolve(code);
    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/qwen/start
async function handleQwenOAuthStart(_req, res) {
  const flowId = genSession();
  const sessionId = genSession();
  const flow = {
    status: 'pending',
    sessionId,
    authUrl: '',
    userCode: '',
    error: '',
  };
  oauthFlows.set(flowId, flow);

  try {
    const device = await beginQwenDeviceOAuth({
      openUrl: openBrowser,
      onAuthUrl: (authUrl) => {
        flow.authUrl = authUrl;
      },
      onUserCode: (userCode) => {
        flow.userCode = userCode;
      },
    });

    void (async () => {
      const start = Date.now();
      let pollIntervalMs = device.intervalMs;
      const timeoutMs = device.expiresIn * 1000;

      while (Date.now() - start < timeoutMs) {
        const result = await pollQwenDeviceOAuth({
          deviceCode: device.deviceCode,
          verifier: device.verifier,
        });
        if (result.status === 'success') {
          sessions.set(sessionId, {
            provider: 'qwen',
            authMode: 'oauth',
            baseUrl: normalizeQwenBaseUrl(result.token.resourceUrl),
            tokens: {
              access: result.token.access,
              refresh: result.token.refresh,
              expires: result.token.expires,
              resourceUrl: result.token.resourceUrl,
              isOAuth: true,
            },
          });
          flow.status = 'complete';
          return;
        }
        if (result.status === 'error') {
          flow.status = 'error';
          flow.error = result.message;
          return;
        }
        if (result.slowDown) {
          pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000);
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      flow.status = 'error';
      flow.error = 'Qwen OAuth timed out waiting for authorization.';
    })().catch((err) => {
      flow.status = 'error';
      flow.error = err instanceof Error ? err.message : String(err);
    });

    sendJSON(res, 200, {
      flowId,
      sessionId,
      authUrl: flow.authUrl,
      userCode: flow.userCode,
    });
  } catch (err) {
    oauthFlows.delete(flowId);
    sendJSON(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

// POST /api/qwen/status
async function handleQwenOAuthStatus(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const flow = oauthFlows.get(data.flowId);
    if (!flow) return sendJSON(res, 404, { error: 'Qwen OAuth flow not found. Start again.' });
    sendJSON(res, 200, {
      status: flow.status,
      sessionId: flow.status === 'complete' ? flow.sessionId : null,
      authUrl: flow.authUrl || null,
      userCode: flow.userCode || null,
      error: flow.error || null,
    });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/openai-codex/start
async function handleOpenAICodexStart(_req, res) {
  const flowId = genSession();
  const sessionId = genSession();
  const manualCode = createDeferred();
  const flow = {
    status: 'pending',
    sessionId,
    authUrl: '',
    error: '',
    manualCode,
  };
  oauthFlows.set(flowId, flow);

  try {
    void startOpenAICodexOAuth({
      openUrl: openBrowser,
      waitForManualCode: async () => await manualCode.promise,
      onAuthUrl: (authUrl) => {
        flow.authUrl = authUrl;
      },
      onProgress: () => {},
    })
      .then((creds) => {
        sessions.set(sessionId, {
          provider: 'openai-codex',
          tokens: {
            access: creds.access,
            refresh: creds.refresh,
            expires: creds.expires,
            accountId: creds.accountId,
            isOAuth: true,
          },
        });
        flow.status = 'complete';
      })
      .catch((err) => {
        flow.status = 'error';
        flow.error = err instanceof Error ? err.message : String(err);
      });

    sendJSON(res, 200, { flowId, sessionId, authUrl: flow.authUrl || null });
  } catch (err) {
    oauthFlows.delete(flowId);
    sendJSON(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// POST /api/openai-codex/status { flowId }
async function handleOpenAICodexStatus(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const flow = oauthFlows.get(data.flowId);
    if (!flow) {
      return sendJSON(res, 404, { error: 'OAuth flow not found. Start again.' });
    }
    sendJSON(res, 200, {
      status: flow.status,
      sessionId: flow.status === 'complete' ? flow.sessionId : null,
      authUrl: flow.authUrl || null,
      error: flow.error || null,
    });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/openai-codex/code { flowId, code }
async function handleOpenAICodexCode(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const flow = oauthFlows.get(data.flowId);
    if (!flow) {
      return sendJSON(res, 404, { error: 'OAuth flow not found. Start again.' });
    }

    const code = String(data.code || '').trim();
    if (!code) {
      return sendJSON(res, 400, { error: 'Authorization code is empty.' });
    }

    flow.manualCode.resolve(code);
    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

// POST /api/byok  { provider, apiKey }
async function handleBYOK(req, res) {
  try {
    const data = JSON.parse(await readBody(req));
    const provider = String(data.provider || '').trim();
    const authMode = String(data.authMode || 'api-key').trim();
    const key  = (data.apiKey || '').trim();

    if (!key) return sendJSON(res, 400, { error: 'API key is empty.' });
    if (!PROVIDER_CATALOG[provider]) {
      return sendJSON(res, 400, { error: 'Unsupported provider.' });
    }
    if (provider === 'anthropic' && authMode === 'setup-token') {
      if (!isValidSetupToken(key)) {
        return sendJSON(res, 400, {
          error: 'Claude setup-token format looks invalid. Run `claude setup-token` and paste the full token value.',
        });
      }
    } else if (!isValidApiKey(provider, key)) {
      return sendJSON(res, 400, {
        error: `Key format does not look valid for ${PROVIDER_CATALOG[provider].label}.`,
      });
    }

    const sessionId = genSession();
    sessions.set(sessionId, {
      provider,
      authMode,
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

    const token  = await resolveSessionAccessToken(session);
    const prompt = buildPrompt(data.requirements);

    const result = await completeWithProvider(session, token, prompt);

    sendJSON(res, 200, { recommendation: result });

  } catch (err) {
    console.error('[/api/recommend]', err);
    sendJSON(res, 500, { error: err.message });
  }
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

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  if (pathname === '/api/openai-codex/start'  && req.method === 'POST') return handleOpenAICodexStart(req, res);
  if (pathname === '/api/openai-codex/status' && req.method === 'POST') return handleOpenAICodexStatus(req, res);
  if (pathname === '/api/openai-codex/code'   && req.method === 'POST') return handleOpenAICodexCode(req, res);
  if (pathname === '/api/gemini/start'        && req.method === 'POST') return handleGeminiOAuthStart(req, res);
  if (pathname === '/api/gemini/status'       && req.method === 'POST') return handleGeminiOAuthStatus(req, res);
  if (pathname === '/api/gemini/code'         && req.method === 'POST') return handleGeminiOAuthCode(req, res);
  if (pathname === '/api/qwen/start'          && req.method === 'POST') return handleQwenOAuthStart(req, res);
  if (pathname === '/api/qwen/status'         && req.method === 'POST') return handleQwenOAuthStatus(req, res);
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
