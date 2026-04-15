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
	OCR_API_V2_JOBS_URL?: string;
	OCR_POLL_INTERVAL_MS?: string;
};

type OcrSettings = Record<string, unknown>;

type OcrUpload = {
	fileBase64: string;
	filename: string | null;
	settings: OcrSettings;
};

const DEFAULT_OCR_API_V2_JOBS_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
const DEFAULT_OCR_POLL_INTERVAL_MS = 3000;
const OCR_V2_MODEL = 'PaddleOCR-VL-1.5';

type V2JobStatus =
	| { state: 'pending' }
	| { state: 'running'; totalPages: number; extractedPages: number }
	| { state: 'done'; extractedPages: number; jsonlUrl: string }
	| { state: 'failed'; errorMsg: string };

type V2JobApiResponse = {
	data: {
		state: string;
		extractProgress?: {
			totalPages?: number;
			extractedPages?: number;
			startTime?: string;
			endTime?: string;
		};
		resultUrl?: {
			jsonUrl?: string;
		};
		errorMsg?: string;
	};
};

type V2JobCreateResponse = {
	data: {
		jobId: string;
	};
};

type JsonlLine = {
	result?: {
		layoutParsingResults?: Array<{
			markdown?: {
				text?: string;
			};
		}>;
	};
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

function getOcrApiV2JobsUrl(env: WorkerEnv): string {
	return typeof env.OCR_API_V2_JOBS_URL === 'string' && env.OCR_API_V2_JOBS_URL.trim()
		? env.OCR_API_V2_JOBS_URL.trim()
		: DEFAULT_OCR_API_V2_JOBS_URL;
}

function sseEvent(eventType: string, data: unknown): string {
	return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createV2Job(fileBytes: ArrayBuffer, filename: string, apiKey: string, env: WorkerEnv): Promise<string> {
	const jobFormData = new FormData();
	jobFormData.set('file', new File([fileBytes], filename, { type: 'application/pdf' }));
	jobFormData.set('model', OCR_V2_MODEL);
	jobFormData.set(
		'optionalPayload',
		JSON.stringify({
			useDocOrientationClassify: false,
			useDocUnwarping: false,
			useChartRecognition: false,
		})
	);

	const response = await fetch(getOcrApiV2JobsUrl(env), {
		method: 'POST',
		headers: {
			Authorization: `bearer ${apiKey}`,
		},
		body: jobFormData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(errorText.trim() || `Job creation failed with status ${response.status}.`);
	}

	const result = (await response.json()) as V2JobCreateResponse;
	return result.data.jobId;
}

async function pollV2JobStatus(jobId: string, apiKey: string, env: WorkerEnv): Promise<V2JobStatus> {
	const response = await fetch(`${getOcrApiV2JobsUrl(env)}/${jobId}`, {
		headers: {
			Authorization: `bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Job status poll failed with status ${response.status}.`);
	}

	const result = (await response.json()) as V2JobApiResponse;
	const data = result.data;

	if (data.state === 'pending') {
		return { state: 'pending' };
	}

	if (data.state === 'running') {
		return {
			state: 'running',
			totalPages: data.extractProgress?.totalPages ?? 0,
			extractedPages: data.extractProgress?.extractedPages ?? 0,
		};
	}

	if (data.state === 'done') {
		return {
			state: 'done',
			extractedPages: data.extractProgress?.extractedPages ?? 0,
			jsonlUrl: data.resultUrl?.jsonUrl ?? '',
		};
	}

	return {
		state: 'failed',
		errorMsg: data.errorMsg ?? 'OCR job failed.',
	};
}

async function fetchJsonlPageTexts(jsonlUrl: string): Promise<string[]> {
	const response = await fetch(jsonlUrl);

	if (!response.ok) {
		throw new Error(`Failed to fetch OCR results with status ${response.status}.`);
	}

	const text = await response.text();
	const pageTexts: string[] = [];

	for (const line of text.split('\n')) {
		if (!line.trim()) continue;

		try {
			const lineData = JSON.parse(line) as JsonlLine;
			const results = lineData.result?.layoutParsingResults;

			if (Array.isArray(results)) {
				for (const res of results) {
					pageTexts.push(res.markdown?.text?.trim() ?? '');
				}
			}
		} catch {
			// Skip invalid JSONL lines
		}
	}

	return pageTexts;
}

async function handleOcrStream(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
	const apiKey = extractApiKey(request);

	if (!apiKey) {
		return textResponse('Missing API key. Provide it in the x-api-key header.', 401);
	}

	const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
	let fileBytes: ArrayBuffer;
	let filename = 'document.pdf';

	try {
		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const uploadedFile = formData.get('file');

			if (!(uploadedFile instanceof File)) {
				return textResponse('Missing PDF file. Submit multipart/form-data with a "file" field.', 400);
			}

			if (uploadedFile.type && uploadedFile.type !== 'application/pdf') {
				return textResponse('Uploaded file must be a PDF.', 400);
			}

			fileBytes = await uploadedFile.arrayBuffer();
			filename = uploadedFile.name || filename;
		} else if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
			fileBytes = await request.arrayBuffer();
		} else {
			return textResponse('Unsupported content type. Use multipart/form-data or application/pdf.', 400);
		}

		if (fileBytes.byteLength === 0) {
			return textResponse('Uploaded PDF is empty.', 400);
		}
	} catch {
		return textResponse('Failed to read uploaded PDF.', 400);
	}

	const rawPollInterval = parseInt(env.OCR_POLL_INTERVAL_MS ?? '');
	const pollIntervalMs = Number.isFinite(rawPollInterval) && rawPollInterval >= 0 ? rawPollInterval : DEFAULT_OCR_POLL_INTERVAL_MS;
	const encoder = new TextEncoder();
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();

	function writeEvent(eventType: string, data: unknown): Promise<void> {
		return writer.write(encoder.encode(sseEvent(eventType, data)));
	}

	ctx.waitUntil(
		(async () => {
			try {
				const jobId = await createV2Job(fileBytes, filename, apiKey, env);

				let jsonlUrl = '';

				while (true) {
					await sleep(pollIntervalMs);
					const status = await pollV2JobStatus(jobId, apiKey, env);

					if (status.state === 'pending') {
						await writeEvent('progress', { state: 'pending' });
					} else if (status.state === 'running') {
						await writeEvent('progress', { state: 'running', totalPages: status.totalPages, extractedPages: status.extractedPages });
					} else if (status.state === 'done') {
						await writeEvent('progress', { state: 'done', extractedPages: status.extractedPages });
						jsonlUrl = status.jsonlUrl;
						break;
					} else if (status.state === 'failed') {
						await writeEvent('error', { message: status.errorMsg });
						return;
					}
				}

				if (!jsonlUrl) {
					await writeEvent('error', { message: 'OCR job completed but no results URL was returned.' });
					return;
				}

				const pageTexts = await fetchJsonlPageTexts(jsonlUrl);

				for (let i = 0; i < pageTexts.length; i++) {
					await writeEvent('page', { pageNumber: i + 1, text: pageTexts[i] });
				}

				await writeEvent('done', { pageCount: pageTexts.length });
			} catch (error) {
				await writeEvent('error', { message: error instanceof Error ? error.message : 'OCR request failed.' });
			} finally {
				await writer.close();
			}
		})()
	);

	return new Response(readable, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			...corsHeaders,
		},
	});
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

export default {
	async fetch(request, env, ctx): Promise<Response> {
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

		if (url.pathname === '/api/ocr/stream' && request.method === 'POST') {
			return handleOcrStream(request, env, ctx);
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
