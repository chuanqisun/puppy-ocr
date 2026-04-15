const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-ocr-settings',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
} as const;

const DEFAULT_OCR_API_URL = 'https://89f849v6s7oe6fea.aistudio-app.com/layout-parsing';
const DEFAULT_OCR_SETTINGS = {
	markdownIgnoreLabels: ['header', 'header_image', 'footer', 'footer_image', 'number', 'footnote', 'aside_text'],
	useDocOrientationClassify: false,
	useDocUnwarping: true,
	useLayoutDetection: true,
	useChartRecognition: false,
	useSealRecognition: false,
	useOcrForImageBlock: false,
	mergeTables: false,
	relevelTitles: true,
	layoutShapeMode: 'auto',
	promptLabel: 'ocr',
	repetitionPenalty: 1,
	temperature: 0,
	topP: 1,
	minPixels: 147384,
	maxPixels: 2822400,
	layoutNms: true,
} as const;

const DEFAULT_OCR_JOB_API_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
const JOB_MODEL = 'PaddleOCR-VL-1.5';
const JOB_POLL_INTERVAL_MS = 3000;

const DEFAULT_JOB_SETTINGS: Record<string, unknown> = {
	useDocOrientationClassify: false,
	useDocUnwarping: false,
	useChartRecognition: false,
};

const BOOLEAN_SETTING_KEYS = new Set([
	'useDocOrientationClassify',
	'useDocUnwarping',
	'useLayoutDetection',
	'useChartRecognition',
	'useSealRecognition',
	'useOcrForImageBlock',
	'formatBlockContent',
	'mergeLayoutBlocks',
	'useQueues',
	'enableHpi',
	'useTensorrt',
	'enableMkldnn',
	'mergeTables',
	'relevelTitles',
	'concatenatePages',
	'layoutNms',
]);

const NUMBER_SETTING_KEYS = new Set([
	'vlRecMaxConcurrency',
	'repetitionPenalty',
	'temperature',
	'topP',
	'minPixels',
	'maxPixels',
	'mkldnnCacheCapacity',
	'cpuThreads',
]);

const STRING_SETTING_KEYS = new Set([
	'pipelineVersion',
	'layoutDetectionModelName',
	'layoutDetectionModelDir',
	'layoutMergeBboxesMode',
	'vlRecModelName',
	'vlRecModelDir',
	'vlRecBackend',
	'vlRecServerUrl',
	'vlRecApiModelName',
	'vlRecApiKey',
	'docOrientationClassifyModelName',
	'docOrientationClassifyModelDir',
	'docUnwarpingModelName',
	'docUnwarpingModelDir',
	'layoutShapeMode',
	'promptLabel',
	'device',
	'precision',
	'paddlexConfig',
]);

const STRING_ARRAY_SETTING_KEYS = new Set(['markdownIgnoreLabels']);
const JSON_SETTING_KEYS = new Set(['layoutThreshold', 'layoutUnclipRatio']);

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
	OCR_JOB_API_URL?: string;
};

type OcrSettings = Record<string, unknown>;

type OcrUpload = {
	fileBase64: string;
	filename: string | null;
	settings: OcrSettings;
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

function getOcrJobApiUrl(env: WorkerEnv): string {
	return typeof env.OCR_JOB_API_URL === 'string' && env.OCR_JOB_API_URL.trim() ? env.OCR_JOB_API_URL.trim() : DEFAULT_OCR_JOB_API_URL;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
	if (value === null) {
		return true;
	}

	if (typeof value === 'string' || typeof value === 'boolean') {
		return true;
	}

	if (typeof value === 'number') {
		return Number.isFinite(value);
	}

	if (Array.isArray(value)) {
		return value.every((item) => isJsonValue(item));
	}

	if (isPlainObject(value)) {
		return Object.values(value).every((item) => isJsonValue(item));
	}

	return false;
}

function parseSettingsObject(input: unknown): OcrSettings {
	if (input === undefined) {
		return {};
	}

	if (!isPlainObject(input)) {
		throw new BadRequestError('OCR settings must be a JSON object.');
	}

	const settings: OcrSettings = {};

	for (const [key, value] of Object.entries(input)) {
		if (BOOLEAN_SETTING_KEYS.has(key)) {
			if (typeof value !== 'boolean') {
				throw new BadRequestError(`Invalid boolean value for OCR setting "${key}".`);
			}

			settings[key] = value;
			continue;
		}

		if (NUMBER_SETTING_KEYS.has(key)) {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				throw new BadRequestError(`Invalid numeric value for OCR setting "${key}".`);
			}

			settings[key] = value;
			continue;
		}

		if (STRING_SETTING_KEYS.has(key)) {
			if (typeof value !== 'string') {
				throw new BadRequestError(`Invalid string value for OCR setting "${key}".`);
			}

			settings[key] = value;
			continue;
		}

		if (STRING_ARRAY_SETTING_KEYS.has(key)) {
			if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
				throw new BadRequestError(`Invalid string array value for OCR setting "${key}".`);
			}

			settings[key] = value;
			continue;
		}

		if (JSON_SETTING_KEYS.has(key)) {
			if (!isJsonValue(value)) {
				throw new BadRequestError(`Invalid JSON value for OCR setting "${key}".`);
			}

			settings[key] = value;
			continue;
		}

		throw new BadRequestError(`Unsupported OCR setting "${key}".`);
	}

	return settings;
}

function parseSettingsJson(rawSettings: string | null): OcrSettings {
	if (!rawSettings?.trim()) {
		return {};
	}

	try {
		return parseSettingsObject(JSON.parse(rawSettings));
	} catch (error) {
		if (error instanceof BadRequestError) {
			throw error;
		}

		throw new BadRequestError('OCR settings must be valid JSON.');
	}
}

function getOcrSettings(rawSettings: OcrSettings): OcrSettings {
	return {
		...DEFAULT_OCR_SETTINGS,
		...rawSettings,
	};
}

async function readPdfUpload(request: Request): Promise<OcrUpload> {
	const contentType = request.headers.get('content-type')?.toLowerCase() || '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const uploadedFile = formData.get('file');
		const rawSettings = formData.get('settings');

		if (!(uploadedFile instanceof File)) {
			throw new BadRequestError('Missing PDF file. Submit multipart/form-data with a "file" field or send application/pdf bytes.');
		}

		if (rawSettings !== null && typeof rawSettings !== 'string') {
			throw new BadRequestError('OCR settings must be sent as a JSON string.');
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
			settings: parseSettingsJson(rawSettings),
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
			settings: parseSettingsJson(request.headers.get('x-ocr-settings')),
		};
	}

	throw new BadRequestError('Unsupported content type. Use multipart/form-data or application/pdf.');
}

async function handleOcr(request: Request, env: WorkerEnv): Promise<Response> {
	const apiKey = extractApiKey(request);

	if (!apiKey) {
		return textResponse('Missing API key. Provide it in the x-api-key header.', 401);
	}

	let upload: OcrUpload;

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
				...getOcrSettings(upload.settings),
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

type JobCreateResponse = {
	data: {
		jobId: string;
	};
};

type JobStatusResponse = {
	data: {
		state: 'pending' | 'running' | 'done' | 'failed';
		extractProgress?: {
			totalPages?: number;
			extractedPages?: number;
		};
		resultUrl?: {
			jsonUrl?: string;
		};
		errorMsg?: string;
	};
};

type JobResultLine = {
	result?: {
		layoutParsingResults?: Array<{
			markdown?: {
				text?: unknown;
			};
		}>;
	};
};

function getJobOptionalPayload(settings: OcrSettings): Record<string, unknown> {
	const payload: Record<string, unknown> = {};
	for (const key of Object.keys(DEFAULT_JOB_SETTINGS)) {
		if (key in settings) {
			payload[key] = settings[key];
		}
	}
	return payload;
}

async function handleOcrStream(request: Request, env: WorkerEnv): Promise<Response> {
	const apiKey = extractApiKey(request);

	if (!apiKey) {
		return textResponse('Missing API key. Provide it in the x-api-key header.', 401);
	}

	let upload: OcrUpload;

	try {
		upload = await readPdfUpload(request);
	} catch (error) {
		if (error instanceof BadRequestError) {
			return textResponse(error.message, 400);
		}

		console.error(error);
		return textResponse('Failed to read uploaded PDF.', 400);
	}

	const { readable, writable } = new TransformStream();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();

	const write = (text: string) => writer.write(encoder.encode(text));

	(async () => {
		try {
			const jobApiUrl = getOcrJobApiUrl(env);
			const authHeaders = { Authorization: `bearer ${apiKey}` };

			// 1. Create job
			const fileBytes = Buffer.from(upload.fileBase64, 'base64');
			const fileBlob = new Blob([fileBytes], { type: 'application/pdf' });

			const jobFormData = new FormData();
			jobFormData.set('file', fileBlob, upload.filename || 'document.pdf');
			jobFormData.set('model', JOB_MODEL);
			jobFormData.set(
				'optionalPayload',
				JSON.stringify({
					...DEFAULT_JOB_SETTINGS,
					...getJobOptionalPayload(upload.settings),
				})
			);

			const createResponse = await fetch(jobApiUrl, {
				method: 'POST',
				headers: authHeaders,
				body: jobFormData,
			});

			if (!createResponse.ok) {
				const errorText = await createResponse.text();
				await write(sseEvent('error', { message: errorText.trim() || `Job creation failed (${createResponse.status}).` }));
				await writer.close();
				return;
			}

			const createData = (await createResponse.json()) as JobCreateResponse;
			const jobId = createData.data.jobId;
			await write(sseEvent('job-created', { jobId }));

			// 2. Poll for status
			let jsonlUrl = '';

			while (true) {
				await delay(JOB_POLL_INTERVAL_MS);

				const statusResponse = await fetch(`${jobApiUrl}/${encodeURIComponent(jobId)}`, {
					headers: authHeaders,
				});

				if (!statusResponse.ok) {
					await write(sseEvent('error', { message: `Status check failed (${statusResponse.status}).` }));
					await writer.close();
					return;
				}

				const statusData = (await statusResponse.json()) as JobStatusResponse;
				const state = statusData.data.state;

				if (state === 'pending') {
					await write(sseEvent('progress', { state: 'pending' }));
				} else if (state === 'running') {
					const progress = statusData.data.extractProgress;
					await write(
						sseEvent('progress', {
							state: 'running',
							totalPages: progress?.totalPages ?? 0,
							extractedPages: progress?.extractedPages ?? 0,
						})
					);
				} else if (state === 'done') {
					jsonlUrl = statusData.data.resultUrl?.jsonUrl ?? '';
					break;
				} else if (state === 'failed') {
					await write(sseEvent('error', { message: statusData.data.errorMsg || 'OCR job failed.' }));
					await writer.close();
					return;
				}
			}

			// 3. Fetch and stream results
			if (!jsonlUrl) {
				await write(sseEvent('error', { message: 'No result URL returned.' }));
				await writer.close();
				return;
			}

			const resultResponse = await fetch(jsonlUrl);

			if (!resultResponse.ok) {
				await write(sseEvent('error', { message: `Failed to fetch results (${resultResponse.status}).` }));
				await writer.close();
				return;
			}

			const resultText = await resultResponse.text();
			const lines = resultText.trim().split('\n');

			const pages: string[] = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const parsed = JSON.parse(trimmed) as JobResultLine;
				const results = parsed.result?.layoutParsingResults;
				if (Array.isArray(results)) {
					for (const res of results) {
						const text = res.markdown?.text;
						pages.push(typeof text === 'string' ? text.trim() : '');
					}
				}
			}

			await write(sseEvent('total-pages', { totalPages: pages.length }));

			for (let i = 0; i < pages.length; i++) {
				await write(sseEvent('page', { pageIndex: i, pageNumber: i + 1, text: pages[i] }));
			}

			await write(sseEvent('done', { totalPages: pages.length }));
			await writer.close();
		} catch (error) {
			try {
				await write(sseEvent('error', { message: error instanceof Error ? error.message : 'OCR stream failed.' }));
				await writer.close();
			} catch {
				// Stream already closed
			}
		}
	})();

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			...corsHeaders,
		},
	});
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

		if (url.pathname === '/api/ocr' && request.method === 'POST') {
			return handleOcr(request, env);
		}

		if (url.pathname === '/api/ocr/stream' && request.method === 'POST') {
			return handleOcrStream(request, env);
		}

		return textResponse('Not found', 404);
	},
} satisfies ExportedHandler<WorkerEnv>;
