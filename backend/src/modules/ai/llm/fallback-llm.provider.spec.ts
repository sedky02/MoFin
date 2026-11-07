import { Logger } from '@nestjs/common';
import {
  AiKeyRejectedException,
  AiUnavailableException,
} from './ai-unavailable.exception';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LlmProvider } from './llm-provider';

class Stub extends LlmProvider {
  enabled = true;
  chat = jest.fn();
}
const request = { messages: [{ role: 'user' as const, content: 'hi' }] };
const answer = (content: string) => ({ content, toolCalls: [] });

describe('FallbackLlmProvider', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it("uses the person's own provider when it works, and never touches the shared one", async () => {
    const own = new Stub();
    const shared = new Stub();
    own.chat.mockResolvedValue(answer('mine'));
    const llm = new FallbackLlmProvider(own, shared);
    await expect(llm.chat(request)).resolves.toEqual(answer('mine'));
    expect(shared.chat).not.toHaveBeenCalled();
    expect(llm.usedSharedFallback).toBe(false);
  });

  it.each([
    ['a refused key', new AiKeyRejectedException('OpenAI')],
    ['an outage or rate limit', new AiUnavailableException()],
  ])(
    'lets the shared provider answer after %s, and says so',
    async (_label, failure) => {
      const own = new Stub();
      const shared = new Stub();
      own.chat.mockRejectedValue(failure);
      shared.chat.mockResolvedValue(answer('shared'));
      const llm = new FallbackLlmProvider(own, shared);
      await expect(llm.chat(request)).resolves.toEqual(answer('shared'));
      expect(llm.usedSharedFallback).toBe(true);
    },
  );

  it('sticks with the shared provider for the rest of the request', async () => {
    const own = new Stub();
    const shared = new Stub();
    own.chat.mockRejectedValue(new AiUnavailableException());
    shared.chat.mockResolvedValue(answer('shared'));
    const llm = new FallbackLlmProvider(own, shared);
    await llm.chat(request);
    await llm.chat(request);
    expect(own.chat).toHaveBeenCalledTimes(1);
    expect(shared.chat).toHaveBeenCalledTimes(2);
  });

  it('does not swallow errors that are not provider failures', async () => {
    const own = new Stub();
    const shared = new Stub();
    own.chat.mockRejectedValue(new TypeError('bug'));
    await expect(
      new FallbackLlmProvider(own, shared).chat(request),
    ).rejects.toThrow('bug');
    expect(shared.chat).not.toHaveBeenCalled();
  });

  it('fails when the shared provider fails too', async () => {
    const own = new Stub();
    const shared = new Stub();
    own.chat.mockRejectedValue(new AiUnavailableException());
    shared.chat.mockRejectedValue(new AiUnavailableException('both down'));
    await expect(
      new FallbackLlmProvider(own, shared).chat(request),
    ).rejects.toThrow('both down');
  });
});
