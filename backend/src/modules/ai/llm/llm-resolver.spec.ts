import { AiUnavailableException } from './ai-unavailable.exception';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LlmProvider } from './llm-provider';
import { LlmResolver } from './llm-resolver';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

class SharedStub extends LlmProvider {
  constructor(readonly enabled = true) {
    super();
  }
  chat = jest.fn();
}

function setup(active: unknown, shared = new SharedStub()) {
  const credentials = { activeKey: jest.fn().mockResolvedValue(active) };
  const config = { getOrThrow: jest.fn(() => 5000) };
  const resolver = new LlmResolver(
    shared,
    credentials as never,
    config as never,
  );
  return { resolver, shared, credentials };
}
const KEY = {
  provider: 'openai',
  apiKey: 'sk-1',
  model: 'm1',
  fallbackEnabled: true,
};

describe('LlmResolver', () => {
  it('uses the shared provider for someone with no key of their own', async () => {
    const { resolver, shared } = setup(null);
    await expect(resolver.forUser('u1')).resolves.toBe(shared);
  });

  it('puts the shared provider behind their key unless they turned that off', async () => {
    const { resolver } = setup(KEY);
    await expect(resolver.forUser('u1')).resolves.toBeInstanceOf(
      FallbackLlmProvider,
    );
    const off = setup({ ...KEY, fallbackEnabled: false });
    await expect(off.resolver.forUser('u1')).resolves.toBeInstanceOf(
      OpenAiCompatibleProvider,
    );
  });

  it('has nothing to fall back to when no shared key is configured', async () => {
    const { resolver } = setup(KEY, new SharedStub(false));
    await expect(resolver.forUser('u1')).resolves.toBeInstanceOf(
      OpenAiCompatibleProvider,
    );
  });

  it('uses the shared provider when a stored key cannot be read, only if they allow the fallback', async () => {
    const unreadable = { ...KEY, apiKey: '', model: '' };
    const allowed = setup(unreadable);
    await expect(allowed.resolver.forUser('u1')).resolves.toBe(allowed.shared);

    const refused = setup({ ...unreadable, fallbackEnabled: false });
    await expect(refused.resolver.forUser('u1')).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });
});
