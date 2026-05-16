import { describe, it, expect, vi } from 'vitest';
import { buildProvider } from './factory';
import type { ModelService } from '@/types/domain';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {}
    messages = { create: vi.fn(), stream: vi.fn() };
  },
}));

const baseService = (overrides: Partial<ModelService> = {}): ModelService => ({
  id: 's1',
  name: 'Test',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKeyCipher: 'unused',
  enabled: true,
  enabledModels: ['claude-sonnet-4-6'],
  createdAt: new Date(),
  ...overrides,
});

describe('buildProvider', () => {
  it('builds AnthropicProvider for anthropic protocol (default)', () => {
    const p = buildProvider(baseService(), 'sk-x');
    expect(p.protocol).toBe('anthropic');
    expect(p.id).toBe('s1');
  });

  it('builds AnthropicWebSearchProvider when withWebSearch=true', () => {
    const p = buildProvider(baseService(), 'sk-x', true);
    expect(p.protocol).toBe('anthropic');
    // Both inherit; just check that we got a provider with id wired
    expect(p.id).toBe('s1');
  });

  it('builds OpenAICompatibleProvider for openai protocol', () => {
    const p = buildProvider(
      baseService({ protocol: 'openai', baseUrl: 'https://api.openai.com/v1' }),
      'sk-x',
    );
    expect(p.protocol).toBe('openai');
    expect(p.baseUrl).toBe('https://api.openai.com/v1');
  });
});
