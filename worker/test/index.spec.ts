import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request;
type TestEnv = {
	OCR_API_URL: string;
};

type TestStreamEnv = TestEnv & {
	OCR_API_V2_JOBS_URL: string;
	OCR_POLL_INTERVAL_MS: string;
};

const env = {
	OCR_API_URL: 'https://ocr.example.com/layout-parsing',
} satisfies TestEnv;

const streamEnv = {
	OCR_API_URL: 'https://ocr.example.com/layout-parsing',
	OCR_API_V2_JOBS_URL: 'https://v2-ocr.example.com/api/v2/ocr/jobs',
	OCR_POLL_INTERVAL_MS: '0',
} satisfies TestStreamEnv;

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function dispatchStream(request: Request): Promise<{ response: Response; body: string }> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, streamEnv, ctx);
	const [body] = await Promise.all([response.text(), waitOnExecutionContext(ctx)]);
	return { response, body };
}

function parseSseEvents(body: string): Array<{ eventType: string; data: unknown }> {
	const events: Array<{ eventType: string; data: unknown }> = [];
	for (const block of body.split('\n\n')) {
		if (!block.trim()) continue;
		let eventType = 'message';
		let rawData = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('event: ')) eventType = line.slice(7).trim();
			else if (line.startsWith('data: ')) rawData = line.slice(6);
		}
		if (rawData) events.push({ eventType, data: JSON.parse(rawData) });
	}
	return events;
}

describe('puppy-ocr worker', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('responds with API status text at the root path', async () => {
		const request = new IncomingRequest('http://example.com');
		const response = await dispatch(request);
		expect(await response.text()).toBe('puppy-ocr OCR API is running.');
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
	});

	it('rejects OCR requests without an API key', async () => {
		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/pdf',
				},
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe('Missing API key. Provide it in the x-api-key header.');
	});

	it('rejects OCR requests without a PDF upload', async () => {
		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': 'test-key',
				},
				body: JSON.stringify({ file: 'ignored' }),
			})
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Unsupported content type. Use multipart/form-data or application/pdf.');
	});

	it('extracts text from an uploaded PDF', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					result: {
						layoutParsingResults: [{ markdown: { text: 'First page' } }, { markdown: { text: 'Second page' } }],
					},
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		);

		const request = new IncomingRequest('https://example.com/api/ocr', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/pdf',
				'x-api-key': 'test-key',
			},
			body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
		});

		const response = await dispatch(request);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('First page\n\nSecond page');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			env.OCR_API_URL,
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'token test-key',
					'Content-Type': 'application/json',
				}),
			})
		);

		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse(String(init?.body));
		expect(body).toEqual({
			file: 'JVBERg==',
			fileType: 0,
			layoutNms: true,
			layoutShapeMode: 'auto',
			markdownIgnoreLabels: ['header', 'header_image', 'footer', 'footer_image', 'number', 'footnote', 'aside_text'],
			maxPixels: 2822400,
			mergeTables: false,
			minPixels: 147384,
			promptLabel: 'ocr',
			relevelTitles: true,
			repetitionPenalty: 1,
			temperature: 0,
			topP: 1,
			useChartRecognition: false,
			useDocOrientationClassify: false,
			useDocUnwarping: true,
			useLayoutDetection: true,
			useOcrForImageBlock: false,
			useSealRecognition: false,
		});
	});

	it('passes client-provided OCR settings overrides from multipart form data', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					result: {
						layoutParsingResults: [{ markdown: { text: 'Configured page' } }],
					},
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		);

		const formData = new FormData();
		formData.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sample.pdf', { type: 'application/pdf' }));
		formData.set(
			'settings',
			JSON.stringify({
				useDocUnwarping: true,
				useLayoutDetection: true,
				temperature: 0.25,
				markdownIgnoreLabels: ['header'],
			})
		);

		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'POST',
				headers: {
					'x-api-key': 'test-key',
				},
				body: formData,
			})
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('Configured page');

		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse(String(init?.body));
		expect(body).toEqual(
			expect.objectContaining({
				file: 'JVBERg==',
				fileType: 0,
				markdownIgnoreLabels: ['header'],
				temperature: 0.25,
				useDocUnwarping: true,
				useLayoutDetection: true,
			})
		);
	});

	it('rejects unsupported OCR settings', async () => {
		const formData = new FormData();
		formData.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sample.pdf', { type: 'application/pdf' }));
		formData.set('settings', JSON.stringify({ unsupportedFlag: true }));

		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'POST',
				headers: {
					'x-api-key': 'test-key',
				},
				body: formData,
			})
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Unsupported OCR setting "unsupportedFlag".');
	});

	it('returns a bad gateway error when the OCR upstream fails', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream unavailable', { status: 503 }));

		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/pdf',
					'x-api-key': 'test-key',
				},
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		expect(response.status).toBe(502);
		expect(await response.text()).toBe('upstream unavailable');
	});

	it('returns preflight cors headers', async () => {
		const response = await dispatch(
			new IncomingRequest('https://example.com/api/ocr', {
				method: 'OPTIONS',
			})
		);

		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,OPTIONS');
	});
});

describe('puppy-ocr worker – SSE streaming route', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects stream requests without an API key', async () => {
		const { response } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		expect(response.status).toBe(401);
	});

	it('rejects stream requests without a PDF upload', async () => {
		const { response } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': 'test-key',
				},
				body: JSON.stringify({}),
			})
		);

		expect(response.status).toBe(400);
	});

	it('returns text/event-stream content type for valid stream requests', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const urlStr = String(url);
			if (urlStr === streamEnv.OCR_API_V2_JOBS_URL) {
				return new Response(JSON.stringify({ data: { jobId: 'job-abc' } }), { status: 200 });
			}
			if (urlStr.endsWith('/job-abc')) {
				return new Response(
					JSON.stringify({
						data: { state: 'done', extractProgress: { extractedPages: 1 }, resultUrl: { jsonUrl: 'https://cdn.example.com/results.jsonl' } },
					}),
					{ status: 200 }
				);
			}
			if (urlStr.includes('results.jsonl')) {
				return new Response('{"result":{"layoutParsingResults":[{"markdown":{"text":"Hello world"}}]}}\n', { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${urlStr}`);
		});

		const { response } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf', 'x-api-key': 'test-key' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
	});

	it('streams progress, page, and done events for a successful OCR job', async () => {
		let pollCount = 0;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const urlStr = String(url);
			if (urlStr === streamEnv.OCR_API_V2_JOBS_URL) {
				return new Response(JSON.stringify({ data: { jobId: 'job-xyz' } }), { status: 200 });
			}
			if (urlStr.endsWith('/job-xyz')) {
				pollCount++;
				if (pollCount === 1) {
					return new Response(JSON.stringify({ data: { state: 'pending' } }), { status: 200 });
				}
				if (pollCount === 2) {
					return new Response(
						JSON.stringify({ data: { state: 'running', extractProgress: { totalPages: 2, extractedPages: 1 } } }),
						{ status: 200 }
					);
				}
				return new Response(
					JSON.stringify({
						data: { state: 'done', extractProgress: { extractedPages: 2 }, resultUrl: { jsonUrl: 'https://cdn.example.com/r.jsonl' } },
					}),
					{ status: 200 }
				);
			}
			if (urlStr.includes('r.jsonl')) {
				return new Response(
					[
						'{"result":{"layoutParsingResults":[{"markdown":{"text":"Page one content"}}]}}',
						'{"result":{"layoutParsingResults":[{"markdown":{"text":"Page two content"}}]}}',
					].join('\n'),
					{ status: 200 }
				);
			}
			throw new Error(`Unexpected fetch: ${urlStr}`);
		});

		const { body } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf', 'x-api-key': 'test-key' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		const events = parseSseEvents(body);
		const progressEvents = events.filter((e) => e.eventType === 'progress');
		const pageEvents = events.filter((e) => e.eventType === 'page');
		const doneEvents = events.filter((e) => e.eventType === 'done');

		expect(progressEvents).toContainEqual({ eventType: 'progress', data: { state: 'pending' } });
		expect(progressEvents).toContainEqual({ eventType: 'progress', data: { state: 'running', totalPages: 2, extractedPages: 1 } });
		expect(progressEvents).toContainEqual({ eventType: 'progress', data: { state: 'done', extractedPages: 2 } });

		expect(pageEvents).toHaveLength(2);
		expect(pageEvents[0]).toEqual({ eventType: 'page', data: { pageNumber: 1, text: 'Page one content' } });
		expect(pageEvents[1]).toEqual({ eventType: 'page', data: { pageNumber: 2, text: 'Page two content' } });

		expect(doneEvents).toHaveLength(1);
		expect(doneEvents[0]).toEqual({ eventType: 'done', data: { pageCount: 2 } });
	});

	it('streams an error event when the OCR job fails', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const urlStr = String(url);
			if (urlStr === streamEnv.OCR_API_V2_JOBS_URL) {
				return new Response(JSON.stringify({ data: { jobId: 'job-fail' } }), { status: 200 });
			}
			if (urlStr.endsWith('/job-fail')) {
				return new Response(JSON.stringify({ data: { state: 'failed', errorMsg: 'Upstream processing error.' } }), { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${urlStr}`);
		});

		const { body } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf', 'x-api-key': 'test-key' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		const events = parseSseEvents(body);
		const errorEvents = events.filter((e) => e.eventType === 'error');

		expect(errorEvents).toHaveLength(1);
		expect(errorEvents[0]).toEqual({ eventType: 'error', data: { message: 'Upstream processing error.' } });
	});

	it('streams an error event when job creation fails', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const urlStr = String(url);
			if (urlStr === streamEnv.OCR_API_V2_JOBS_URL) {
				return new Response('Service unavailable', { status: 503 });
			}
			throw new Error(`Unexpected fetch: ${urlStr}`);
		});

		const { body } = await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf', 'x-api-key': 'test-key' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		const events = parseSseEvents(body);
		const errorEvents = events.filter((e) => e.eventType === 'error');

		expect(errorEvents).toHaveLength(1);
		expect((errorEvents[0].data as { message: string }).message).toContain('Service unavailable');
	});

	it('forwards the PDF to the v2 jobs API with correct auth and model', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			const urlStr = String(url);
			if (urlStr === streamEnv.OCR_API_V2_JOBS_URL) {
				return new Response(JSON.stringify({ data: { jobId: 'job-check' } }), { status: 200 });
			}
			if (urlStr.endsWith('/job-check')) {
				return new Response(
					JSON.stringify({
						data: { state: 'done', extractProgress: { extractedPages: 1 }, resultUrl: { jsonUrl: 'https://cdn.example.com/c.jsonl' } },
					}),
					{ status: 200 }
				);
			}
			if (urlStr.includes('c.jsonl')) {
				return new Response('{"result":{"layoutParsingResults":[{"markdown":{"text":"content"}}]}}\n', { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${urlStr}`);
		});

		await dispatchStream(
			new IncomingRequest('https://example.com/api/ocr/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/pdf', 'x-api-key': 'my-api-key' },
				body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			})
		);

		const [jobCreateUrl, jobCreateInit] = fetchSpy.mock.calls[0];
		expect(jobCreateUrl).toBe(streamEnv.OCR_API_V2_JOBS_URL);
		expect((jobCreateInit?.headers as Record<string, string>)?.Authorization).toBe('bearer my-api-key');

		const body = jobCreateInit?.body as FormData;
		expect(body.get('model')).toBe('PaddleOCR-VL-1.5');
	});
});
