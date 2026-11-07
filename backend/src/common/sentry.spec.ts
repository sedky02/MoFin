import { scrubSentryEvent } from './sentry';

describe('scrubSentryEvent', () => {
  it('drops the request body, cookies and credential headers, keeping the rest', () => {
    const event = scrubSentryEvent({
      message: 'boom',
      request: {
        url: '/api/v1/ai/credentials/openai',
        method: 'PUT',
        data: { apiKey: 'sk-secret' },
        cookies: { access_token: 't' },
        headers: {
          Authorization: 'Bearer abc',
          'x-mofin-bff-secret': 's',
          'user-agent': 'jest',
        },
      },
    });
    expect(JSON.stringify(event)).not.toContain('sk-secret');
    expect(event.request).toEqual({
      url: '/api/v1/ai/credentials/openai',
      method: 'PUT',
      headers: { 'user-agent': 'jest' },
    });
    expect(event.message).toBe('boom');
  });

  it('leaves an event without a request alone', () => {
    expect(scrubSentryEvent({ message: 'x' })).toEqual({ message: 'x' });
  });
});
