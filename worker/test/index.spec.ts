import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('life-config worker', () => {
	it('responds with API status text at the root path', async () => {
		const request = new IncomingRequest('http://example.com');
		const response = await worker.fetch(request, env);
		expect(await response.text()).toBe('life-config image API is running.');
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
	});

	it('rejects generate requests without a prompt', async () => {
		const response = await SELF.fetch('https://example.com/api/generate', {
			headers: {
				'x-api-key': 'test-key',
			},
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Missing required query parameter: prompt' });
	});

	it('returns preflight cors headers', async () => {
		const response = await SELF.fetch('https://example.com/api/generate', {
			method: 'OPTIONS',
		});

		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,OPTIONS');
	});
});
