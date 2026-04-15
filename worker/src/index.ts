const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
} as const;

const DEFAULT_OCR_API_URL = 'https://89f849v6s7oe6fea.aistudio-app.com/layout-parsing';

class BadRequestError extends Error {}

type LayoutParsingPage = {
	markdown?: {
		text?: unknown;
	};
};

type LayoutParsingResponse = {
	result?: {
		layoutParsingResults?: LayoutParsingPage[];
	};
};

type WorkerEnv = {
	OCR_API_URL?: string;
};

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

function getOcrApiUrl(env: WorkerEnv): string {
	return typeof env.OCR_API_URL === 'string' && env.OCR_API_URL.trim() ? env.OCR_API_URL.trim() : DEFAULT_OCR_API_URL;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString('base64');
}

function extractPageText(payload: LayoutParsingResponse): string[] {
	const results = payload.result?.layoutParsingResults;

	if (!Array.isArray(results)) {
		return [];
	}

	return results.map((page) => {
		const text = page.markdown?.text;
		return typeof text === 'string' ? text.trim() : '';
	});
}

async function readPdfUpload(request: Request): Promise<{ fileBase64: string; filename: string | null }> {
	const contentType = request.headers.get('content-type')?.toLowerCase() || '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const uploadedFile = formData.get('file');

		if (!(uploadedFile instanceof File)) {
			throw new BadRequestError('Missing PDF file. Submit multipart/form-data with a "file" field or send application/pdf bytes.');
		}

		if (uploadedFile.type && uploadedFile.type !== 'application/pdf') {
			throw new BadRequestError('Uploaded file must be a PDF.');
		}

		const fileBuffer = await uploadedFile.arrayBuffer();

		if (fileBuffer.byteLength === 0) {
			throw new BadRequestError('Uploaded PDF is empty.');
		}

		return {
			fileBase64: arrayBufferToBase64(fileBuffer),
			filename: uploadedFile.name || null,
		};
	}

	if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
		const fileBuffer = await request.arrayBuffer();

		if (fileBuffer.byteLength === 0) {
			throw new BadRequestError('Uploaded PDF is empty.');
		}

		return {
			fileBase64: arrayBufferToBase64(fileBuffer),
			filename: null,
		};
	}

	throw new BadRequestError('Unsupported content type. Use multipart/form-data or application/pdf.');
}

async function handleOcr(request: Request, env: WorkerEnv): Promise<Response> {
	const apiKey = extractApiKey(request);

	if (!apiKey) {
		return textResponse('Missing API key. Provide it in the x-api-key header.', 401);
	}

	let upload: { fileBase64: string; filename: string | null };

	try {
		upload = await readPdfUpload(request);
	} catch (error) {
		if (error instanceof BadRequestError) {
			return textResponse(error.message, 400);
		}

		console.error(error);
		return textResponse('Failed to read uploaded PDF.', 400);
	}

	try {
		const upstreamResponse = await fetch(getOcrApiUrl(env), {
			method: 'POST',
			headers: {
				Authorization: `token ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				file: upload.fileBase64,
				fileType: 0,
				useDocOrientationClassify: false,
				useDocUnwarping: false,
				useChartRecognition: false,
			}),
		});

		if (!upstreamResponse.ok) {
			const errorText = await upstreamResponse.text();
			const message = errorText.trim() || `OCR upstream request failed with status ${upstreamResponse.status}.`;
			return textResponse(message, 502);
		}

		const payload = (await upstreamResponse.json()) as LayoutParsingResponse;
		const pages = extractPageText(payload);
		const text = pages.filter(Boolean).join('\n\n').trim();

		if (!text) {
			return textResponse('OCR response did not include any text.', 502);
		}

		return textResponse(text, 200);
	} catch (error) {
		console.error(error);
		return textResponse(error instanceof Error ? error.message : 'OCR request failed.', 500);
	}
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		if (url.pathname === '/' && request.method === 'GET') {
			return textResponse('puppy-ocr OCR API is running.');
		}

		if (url.pathname !== '/api/ocr') {
			return textResponse('Not found', 404);
		}

		if (request.method === 'POST') {
			return handleOcr(request, env);
		}

		return textResponse('Method not allowed', 405);
	},
} satisfies ExportedHandler<WorkerEnv>;
