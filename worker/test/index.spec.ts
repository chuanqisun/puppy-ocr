import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request;
type TestEnv = {
	OCR_API_URL: string;
};

const env = {
	OCR_API_URL: 'https://ocr.example.com/layout-parsing',
} satisfies TestEnv;

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
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
			useChartRecognition: false,
			useDocOrientationClassify: false,
			useDocUnwarping: false,
		});
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
