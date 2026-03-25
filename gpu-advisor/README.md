# GPU Advisor

Local GPU and LLM infrastructure recommendation app for Indian AI teams.

It combines:

- a dataset-backed offline recommendation engine
- optional AI-assisted recommendations through multiple model providers
- reusable OAuth helpers for providers that support browser or device login

## What It Supports

### Offline mode

- no account required
- instant recommendations from the bundled platform dataset

### AI providers

- Anthropic
  - API key
  - `claude setup-token`
- OpenAI
  - API key
- ChatGPT / OpenAI Codex
  - OAuth
- Gemini
  - API key
  - OAuth via Gemini CLI / Google Cloud Code Assist
- Mistral
  - API key
- Qwen
  - API key / portal token
  - OAuth 2.0 device flow
- Kimi
  - API key
- Groq
  - API key
- DeepSeek
  - API key

## Project Files

- `server.js`
  Main local server, provider routing, session handling, and recommendation endpoint.
- `public/index.html`
  Single-page UI for auth, provider selection, and recommendation display.
- `oauth-providers.js`
  Reusable OAuth helper module for OpenAI Codex, Gemini, and Qwen.
- `bootstrap.js`
  Installs dependencies on first run if needed.
- `launch.sh`
  Mac/Linux launcher.
- `launch.bat`
  Windows launcher.

## Run It

### macOS / Linux

```bash
bash launch.sh
```

### Windows

Double-click `launch.bat`

### Direct

```bash
npm start
```

Open:

```text
http://localhost:3131
```

## Requirements

- Node.js 20+
- internet access for provider-backed AI mode
- provider credentials or OAuth approval for the services you want to use

## Authentication Notes

### Anthropic

You can either:

- paste an Anthropic API key
- run `claude setup-token` and paste the returned setup token

### ChatGPT / OpenAI Codex

Uses browser OAuth and refresh-token based session renewal while the server stays running.

### Gemini

Supports two paths:

- Gemini API key
- Gemini OAuth through the Gemini CLI / Google Cloud Code Assist flow

The OAuth path is useful when you want longer-lived auth without manually handling API keys.

### Qwen

Supports:

- direct portal token / API key
- OAuth device flow

The device flow shows a verification URL and code, then polls for approval and refreshes access automatically while the app remains running.

## Reusable OAuth Module

The file `oauth-providers.js` is meant to be reused in other projects.

It currently exposes helpers for:

- OpenAI Codex OAuth
- Gemini CLI OAuth
- Qwen device OAuth
- refresh-token renewal for those providers

### Exported helpers

- `createDeferred()`
- `startOpenAICodexOAuth(...)`
- `refreshOpenAICodexSession(...)`
- `startGeminiCliOAuth(...)`
- `refreshGeminiCliSession(...)`
- `beginQwenDeviceOAuth(...)`
- `pollQwenDeviceOAuth(...)`
- `refreshQwenOAuthSession(...)`
- `normalizeQwenBaseUrl(...)`

### Example reuse

```js
const {
  createDeferred,
  startGeminiCliOAuth,
  beginQwenDeviceOAuth,
  pollQwenDeviceOAuth,
} = require('./oauth-providers');
```

The module is intentionally separated from the UI so you can copy it into another local Node app and keep the same auth behavior.

## Current Session Model

Right now, sessions are:

- stored in memory on the local server
- referenced in browser `sessionStorage`
- not persisted across server restarts

That means OAuth refresh tokens are used to avoid repeated login while the app is running, but the app does not yet persist those sessions across a full restart.

## Verification

Basic checks used during development:

```bash
node --check server.js
node --check bootstrap.js
npm start
```

## Next Good Improvements

- persist OAuth sessions securely across restarts
- split the auth UI into cleaner OAuth vs API-key sections
- add provider-specific health checks
- add a small `oauth-example.js` that imports `oauth-providers.js`
