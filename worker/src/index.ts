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
	relevelTitles: false,
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
