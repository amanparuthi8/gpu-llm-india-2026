#!/usr/bin/env node

const crypto = require('crypto');

const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api';
const GOOGLE_GEMINI_CLI_BASE_URL = 'https://cloudcode-pa.googleapis.com';
const QWEN_PORTAL_BASE_URL = 'https://portal.qwen.ai/v1';
const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai';
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
const QWEN_OAUTH_SCOPE = 'openid profile email model.completion';
const QWEN_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadPiAiOAuth() {
  return await import('@mariozechner/pi-ai/oauth');
}

async function startOpenAICodexOAuth(params) {
  const { loginOpenAICodex } = await loadPiAiOAuth();
  return await loginOpenAICodex({
    onAuth: ({ url }) => {
      params.onAuthUrl?.(url);
      params.openUrl?.(url);
    },
    onPrompt: async () => await params.waitForManualCode(),
    onManualCodeInput: async () => await params.waitForManualCode(),
    onProgress: (message) => params.onProgress?.(message),
    originator: 'pi',
  });
}

async function refreshOpenAICodexSession(tokens) {
  const { getOAuthApiKey } = await loadPiAiOAuth();
  const refreshed = await getOAuthApiKey('openai-codex', {
    'openai-codex': {
      access: tokens.access,
      refresh: tokens.refresh,
      expires: tokens.expires,
      accountId: tokens.accountId,
    },
  });

  if (!refreshed?.apiKey || !refreshed.newCredentials) {
    throw new Error('OpenAI Codex session unavailable. Sign in again.');
  }

  return {
    apiKey: refreshed.apiKey,
    tokens: {
      ...tokens,
      access: refreshed.newCredentials.access,
      refresh: refreshed.newCredentials.refresh,
      expires: refreshed.newCredentials.expires,
      accountId: refreshed.newCredentials.accountId,
    },
  };
}

async function startGeminiCliOAuth(params) {
  const { loginGeminiCli } = await loadPiAiOAuth();
  return await loginGeminiCli(
    ({ url, instructions }) => {
      params.onAuthUrl?.(url);
      params.onInstructions?.(instructions || '');
      params.openUrl?.(url);
    },
    (message) => params.onProgress?.(message),
    async () => await params.waitForManualCode(),
  );
}

async function refreshGeminiCliSession(tokens) {
  if (!tokens.refresh || !tokens.projectId) {
    throw new Error('Gemini OAuth session missing refresh token or project ID.');
  }
  const { refreshGoogleCloudToken } = await loadPiAiOAuth();
  const refreshed = await refreshGoogleCloudToken(tokens.refresh, tokens.projectId);
  return {
    ...tokens,
    access: refreshed.access,
    refresh: refreshed.refresh,
    expires: refreshed.expires,
    projectId: refreshed.projectId ?? tokens.projectId,
  };
}

function normalizeQwenBaseUrl(value) {
  const raw = (value || '').trim() || QWEN_PORTAL_BASE_URL;
  const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`;
  return withProtocol.endsWith('/v1') ? withProtocol : `${withProtocol.replace(/\/+$/, '')}/v1`;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generatePkceVerifierChallenge() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function toFormUrlEncoded(values) {
  return new URLSearchParams(values).toString();
}

async function beginQwenDeviceOAuth(params) {
  const { verifier, challenge } = generatePkceVerifierChallenge();
  const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-request-id': crypto.randomUUID(),
    },
    body: toFormUrlEncoded({
      client_id: QWEN_OAUTH_CLIENT_ID,
      scope: QWEN_OAUTH_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen device authorization failed: ${text || response.statusText}`);
  }

  const payload = await response.json();
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error('Qwen device authorization returned an incomplete payload.');
  }

  const authUrl = payload.verification_uri_complete || payload.verification_uri;
  params.onAuthUrl?.(authUrl);
  params.onUserCode?.(payload.user_code);
  params.openUrl?.(authUrl);

  return {
    verifier,
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    authUrl,
    expiresIn: payload.expires_in,
    intervalMs: (payload.interval ? payload.interval : 2) * 1000,
  };
}

async function pollQwenDeviceOAuth(params) {
  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: toFormUrlEncoded({
      grant_type: QWEN_OAUTH_GRANT_TYPE,
      client_id: QWEN_OAUTH_CLIENT_ID,
      device_code: params.deviceCode,
      code_verifier: params.verifier,
    }),
  });

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      const text = await response.text();
      return { status: 'error', message: text || response.statusText };
    }

    if (payload?.error === 'authorization_pending') return { status: 'pending' };
    if (payload?.error === 'slow_down') return { status: 'pending', slowDown: true };
    return {
      status: 'error',
      message: payload?.error_description || payload?.error || response.statusText,
    };
  }

  const payload = await response.json();
  if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
    return { status: 'error', message: 'Qwen OAuth returned incomplete token payload.' };
  }

  return {
    status: 'success',
    token: {
      access: payload.access_token,
      refresh: payload.refresh_token,
      expires: Date.now() + payload.expires_in * 1000,
      resourceUrl: payload.resource_url,
    },
  };
}

async function refreshQwenOAuthSession(tokens) {
  const refreshToken = (tokens.refresh || '').trim();
  if (!refreshToken) {
    throw new Error('Qwen OAuth refresh token missing; sign in again.');
  }

  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: toFormUrlEncoded({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: QWEN_OAUTH_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen OAuth refresh failed: ${text || response.statusText}`);
  }

  const payload = await response.json();
  if (!payload.access_token || !payload.expires_in) {
    throw new Error('Qwen OAuth refresh response missing access token.');
  }

  return {
    ...tokens,
    access: payload.access_token,
    refresh: payload.refresh_token || refreshToken,
    expires: Date.now() + payload.expires_in * 1000,
    resourceUrl: payload.resource_url,
  };
}

module.exports = {
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
};
