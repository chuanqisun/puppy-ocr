import Replicate from 'replicate';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
} as const;

function jsonResponse(payload: unknown, status: number): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders,
		},
	});
}

function textResponse(text: string, status = 200): Response {
	return new Response(text, {
		status,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			...corsHeaders,
		},
	});
}

function extractApiKey(request: Request): string {
	return request.headers.get('x-api-key')?.trim() || '';
}

async function handleGenerate(request: Request, prompt: unknown, referenceImage: unknown): Promise<Response> {
	const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
	const normalizedReferenceImage = typeof referenceImage === 'string' ? referenceImage.trim() : '';
	const apiKey = extractApiKey(request);

	if (!normalizedPrompt) {
		return jsonResponse({ error: 'Missing required query parameter: prompt' }, 400);
	}

	if (!apiKey) {
		return jsonResponse({ error: 'Missing API key. Provide it in the x-api-key header.' }, 401);
	}

	try {
		const replicate = new Replicate({ auth: apiKey });
		const output = await replicate.run('black-forest-labs/flux-2-klein-4b', {
			input: {
				images: normalizedReferenceImage ? [normalizedReferenceImage] : [],
				prompt: normalizedPrompt,
				image_format: 'webp',
				aspect_ratio: '1:1',
				output_quality: 95,
				output_megapixels: '1',
			},
		});

		const fileOutput = Array.isArray(output) ? output[0] : output;

		if (!fileOutput || typeof fileOutput !== 'object' || !('url' in fileOutput) || typeof fileOutput.url !== 'function') {
			throw new Error('Replicate did not return an image URL.');
		}

		const imageResponse = await fetch(fileOutput.url());

		if (!imageResponse.ok) {
			throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
		}

		const imageBytes = await imageResponse.arrayBuffer();
		const outputContentType = imageResponse.headers.get('content-type') || 'image/webp';

		return new Response(imageBytes, {
			headers: {
				'Content-Type': outputContentType,
				'Cache-Control': 'no-store',
				...corsHeaders,
			},
		});
	} catch (error) {
		console.error(error);
		return jsonResponse({ error: error instanceof Error ? error.message : 'Image generation failed.' }, 500);
	}
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown>> {
	try {
		return (await request.json()) as Record<string, unknown>;
	} catch {
		throw new Error('Request body must be valid JSON.');
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		if (url.pathname === '/' && request.method === 'GET') {
			return textResponse('life-config image API is running.');
		}

		if (url.pathname !== '/api/generate') {
			return textResponse('Not found', 404);
		}

		if (request.method === 'GET') {
			return handleGenerate(request, url.searchParams.get('prompt'), url.searchParams.get('referenceImage'));
		}

		if (request.method === 'POST') {
			try {
				const body = await parseRequestBody(request);
				return handleGenerate(request, body.prompt, body.referenceImage);
			} catch (error) {
				return jsonResponse({ error: error instanceof Error ? error.message : 'Request body must be valid JSON.' }, 400);
			}
		}

		return textResponse('Method not allowed', 405);
	},
} satisfies ExportedHandler<Env>;
