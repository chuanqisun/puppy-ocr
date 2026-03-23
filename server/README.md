# Express image API

Dead-simple Node backend for image generation.

## Setup

1. Copy [.env.example](../.env.example) to `.env`.
2. Add `REPLICATE_API_TOKEN`.
3. Install dependencies with `npm install` in the project root.
4. Start the API with `npm run dev:api`.

The scripts use Node's native `--env-file=.env` support, so no extra env loader is needed.

## Endpoint

- `GET /api/generate?prompt=bioluminescent%20marine%20organism`

The endpoint returns the generated image bytes directly.
