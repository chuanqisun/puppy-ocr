# Cloudflare Worker API

## Local development

1. Install root dependencies with `npm install`.
2. Start the Worker from the repo root with `npm run worker`.
3. Open the local Worker URL printed by Wrangler, typically `http://localhost:8787`.

## Deployment

1. Authenticate Wrangler with `npx wrangler login` inside `worker/`.
2. Deploy with `npm run worker:deploy` from the repo root.

## OCR API

The worker exposes a single OCR endpoint:

```text
POST /api/ocr
```

Requirements:

- Send the upstream OCR token in the `x-api-key` header.
- Upload the PDF either as raw `application/pdf` bytes or as `multipart/form-data` with a `file` field.

Successful requests return `text/plain` containing the extracted OCR output in markdown-like text.

## Frontend integration

The frontend reads the OCR API base URL from Vite env files.

Local development uses `.env.development`, which is configured to target `http://localhost:8787`.

To override the API target, set `VITE_IMAGE_API_BASE_URL` before starting Vite. Example:

```bash
VITE_IMAGE_API_BASE_URL="https://your-worker-subdomain.workers.dev" npm run dev:web
```

Production builds read `.env.production`, which is configured to use `https://life-config-worker.fast.workers.dev`.

## Upstream OCR service

By default the worker forwards OCR requests to the hosted layout parsing endpoint used in [docs/ocr-node.js](/home/stack/repos/puppy-ocr/docs/ocr-node.js).

To change the upstream endpoint, set the `OCR_API_URL` Wrangler variable or environment-specific override.
