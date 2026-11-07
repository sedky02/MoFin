import { z } from 'zod';

export const AI_PROVIDER_IDS = [
  'groq',
  'openai',
  'openrouter',
  'gemini',
] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export const aiProviderSchema = z.enum(AI_PROVIDER_IDS);

export interface ProviderPreset {
  label: string;
  /**
   * Fixed on purpose: a person supplies a key, never a URL, so a stored key can only ever be
   * sent to these hosts.
   */
  baseUrl: string;
  defaultModel: string;
  /** Newer OpenAI models refuse `max_tokens` and a custom temperature. */
  tokenLimitParam: 'max_tokens' | 'max_completion_tokens';
  sendTemperature: boolean;
}

export const PROVIDER_PRESETS: Record<AiProviderId, ProviderPreset> = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    tokenLimitParam: 'max_tokens',
    sendTemperature: true,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    tokenLimitParam: 'max_completion_tokens',
    sendTemperature: false,
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-6-luna',
    tokenLimitParam: 'max_tokens',
    sendTemperature: true,
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    tokenLimitParam: 'max_tokens',
    sendTemperature: true,
  },
};

/** What people may type as a model id: the characters real ids use, nothing that reshapes a URL or JSON. */
export const modelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Not a valid model id');
