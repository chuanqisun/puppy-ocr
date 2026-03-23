# Cloudflare Worker API

Alternative implementation of the image API in `/server/index.mjs` using Cloudflare Workers.

## What it matches

- `GET /` returns `life-config image API is running.`
- `GET /api/generate?prompt=...&referenceImage=...`
- `POST /api/generate` with JSON `{ "prompt": string, "referenceImage"?: string }`
- `x-api-key` request header for the Replicate API key
- Binary image response with `Cache-Control: no-store`
- CORS headers for the Vite frontend

## Local development

1. Install root dependencies with `npm install`.
2. Start the Worker from the repo root with `npm run worker`.
3. Open the local Worker URL printed by Wrangler, typically `http://localhost:8787`.

## Deployment

1. Authenticate Wrangler with `npx wrangler login` inside `worker/`.
2. Deploy with `npm run worker:deploy` from the repo root.

## Frontend integration

The frontend reads the image API base URL from Vite env files.

Local development uses `.env.development`, which is configured to target `http://localhost:8787`.

To override the API target, set `VITE_IMAGE_API_BASE_URL` before starting Vite. Example:

```bash
VITE_IMAGE_API_BASE_URL="https://your-worker-subdomain.workers.dev" npm run dev:web
```

Production builds read `.env.production`, which is configured to use `https://life-config-worker.fast.workers.dev`.
