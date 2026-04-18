# Messenger Thesis Bot

A clean, modular Node.js backend for a Facebook Messenger auto-reply bot for a thesis support service page. It runs locally first, receives Messenger webhook events, keeps small in-process per-user memory, detects language style, uses lightweight response-pattern guidance, generates short replies with Gemini first, falls back to DeepSeek only if Gemini quota is exhausted, and sends replies back through the Facebook Messenger Send API.

## Overview

Event flow:

`Messenger -> webhook -> memory/language/pattern logic -> Gemini -> DeepSeek fallback on Gemini quota exhaustion -> Send API -> reply`

Main features:

- Meta webhook verification
- Messenger text and image message handling
- Per-user in-process memory
- Lightweight language-style detection
- Concise Roman Nepali-first reply shaping
- Unsupported-service guard
- Similar-question response-pattern guidance
- Gemini-first reply generation with compact prompts
- DeepSeek fallback when Gemini quota is exhausted
- Facebook Messenger Send API text and image reply
- Duplicate-event protection, debounce, timeout, and retry handling

## Prerequisites

- Node.js 18 or newer
- A Meta app with Messenger configured
- A Facebook Page connected to your app
- A valid Page access token
- A Gemini API key
- A DeepSeek API key for fallback
- `ngrok` for local webhook exposure

## Install

```powershell
cd messenger-deepseek-bot
npm install
```

## Environment Setup

Create `.env` from the example file:

```powershell
Copy-Item .env.example .env
```

Fill these values in `.env`:

- `PORT`
- `VERIFY_TOKEN`
- `PAGE_ACCESS_TOKEN`
- `PUBLIC_BASE_URL`
- `MESSENGER_API_BASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `GEMINI_MODEL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `MODEL_TEMPERATURE`
- `MODEL_MAX_TOKENS`
- `MAX_MEMORY_MESSAGES`
- `REQUEST_TIMEOUT_MS`
- `IMAGE_ANALYSIS_PROVIDER`
- `APP_ENV`

Use environment variables only. Never place secrets in source code.

## Run Locally

```powershell
npm run dev
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run dev
```

Health check:

```text
http://localhost:3000/health
```

Expected response:

```json
{ "ok": true }
```

## Expose Localhost With ngrok

```powershell
ngrok http 3000
```

Use this callback URL format in Meta:

```text
https://YOUR_PUBLIC_URL/webhook
```

The verify token in Meta must exactly match `VERIFY_TOKEN` in `.env`.

## Meta Webhook Setup

1. Open the Meta App Dashboard.
2. Open your app.
3. Go to Messenger webhook settings.
4. Set the callback URL to `https://YOUR_PUBLIC_URL/webhook`.
5. Set the verify token to the same value used in `.env`.
6. Verify and save.
7. Subscribe only to `messages`.
8. Connect the Facebook Page to your app.

For development testing with admins, developers, or testers, full App Review is not required.

## Test Flow

1. Start the app with `npm run dev`.
2. Start ngrok with `ngrok http 3000`.
3. Put the ngrok HTTPS URL plus `/webhook` into Meta.
4. Use the same verify token from `.env`.
5. Subscribe only to `messages`.
6. Send a message to the Page from a test account.
7. Watch the terminal logs.

## Provider Check

Run a live smoke test against the configured AI providers:

```powershell
npm run check:providers
```

Optional single-provider checks:

```powershell
node scripts/check-providers.js --provider=gemini
node scripts/check-providers.js --provider=deepseek
```

## Conversation Logic

The bot:

- stores a small recent history per sender in memory
- stores up to 5 recent inbound image metadata entries per sender in memory
- detects one of four language styles:
  - english
  - nepali
  - roman_nepali
  - mixed
- prefers concise Roman Nepali for Nepali-style users unless English is clearly used
- blocks unsupported services like PhD, MPhil, and engineering thesis
- checks common intent patterns such as greeting, pricing, proposal only, chapter 4 and 5, formatting only, topic support, and supervisor feedback
- can send a sample public image when users ask for sample photos or images
- serves deployable image assets from `/media/thesis-master/...`
- builds a compact prompt for Gemini or DeepSeek
- replies in the user's language style

Memory is in-process only and resets when the server restarts.

## Troubleshooting

### Verify token mismatch

- Make sure `VERIFY_TOKEN` in `.env` exactly matches what you entered in Meta.

### Wrong callback URL

- Use the full public URL from ngrok plus `/webhook`.

### Tunnel not running

- If ngrok is not running, Meta cannot reach your local server.

### Laptop sleeping

- Sleep mode can stop the local server or tunnel.

### Wi-Fi disconnected

- Meta, DeepSeek, and Send API calls all require internet access.

### Invalid Page access token

- Generate a fresh Page access token in Meta and update `.env`.

### App not subscribed correctly

- Make sure the app is connected to the Page and subscribed to `messages`.

### Gemini API failure

- Check `GEMINI_API_KEY`, `GEMINI_BASE_URL`, and `GEMINI_MODEL`.

### DeepSeek fallback failure

- Check `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`.

### No reply due to unsupported event type

- The bot processes text and image messages, and ignores delivery, read, echo, non-message, unsupported attachments, and blank messages.

## Deploy To Render

This project includes a `render.yaml` file so it is ready for GitHub-based deployment on Render.

### Recommended Render flow

1. Push this project to a GitHub repository.
2. In Render, click `New +` -> `Blueprint`.
3. Connect your GitHub account and select the repository.
4. Render will detect `render.yaml`.
5. Review the service name, plan, and region.
6. Set the secret environment variables in Render:
- `VERIFY_TOKEN`
- `PAGE_ACCESS_TOKEN`
- `PUBLIC_BASE_URL`
- `MESSENGER_API_BASE_URL`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
7. Deploy the service.
8. After deployment, open the Render service URL and confirm:

```text
https://YOUR_RENDER_URL/health
```

returns:

```json
{ "ok": true }
```

9. Update Meta webhook callback URL to:

```text
https://YOUR_RENDER_URL/webhook
```

10. Keep the Meta verify token exactly the same as `VERIFY_TOKEN` in Render.
11. Set `PUBLIC_BASE_URL` to your Render service root URL, for example:

```text
https://YOUR_RENDER_URL
```

This is required so the bot can send public image URLs like `/media/thesis-master/02-mba-thesis-support.png` through Messenger.

### Render environment variables

Set these in Render:

- `VERIFY_TOKEN=your_custom_verify_token`
- `PAGE_ACCESS_TOKEN=your_meta_page_access_token`
- `PUBLIC_BASE_URL=https://your-service.onrender.com`
- `MESSENGER_API_BASE_URL=https://graph.facebook.com/v23.0`
- `GEMINI_API_KEY=your_gemini_api_key`
- `GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta`
- `GEMINI_MODEL=gemini-2.5-flash`
- `DEEPSEEK_API_KEY=your_deepseek_api_key`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-chat`
- `MODEL_TEMPERATURE=0.4`
- `MODEL_MAX_TOKENS=120`
- `MAX_MEMORY_MESSAGES=8`
- `REQUEST_TIMEOUT_MS=5000`
- `IMAGE_ANALYSIS_PROVIDER=none`
- `APP_ENV=production`

Render provides `PORT` automatically for web services, so you do not need to set `PORT` manually there.

## Deploy Later

After local testing works, the same backend can be deployed to Render or a VPS by setting the same environment variables on the server and updating Meta to the deployed `/webhook` URL.
