# Express image API

Dead-simple Node backend for image generation.

## Setup

1. Install dependencies with `npm install` in the project root.
2. Start the API with `npm run dev:api`.
3. Enter your Replicate API key in the frontend before rendering.

## Endpoint

- `GET /api/generate?prompt=bioluminescent%20marine%20organism`

Provide the API key on every request with the `x-api-key` header.

The endpoint returns the generated image bytes directly.
