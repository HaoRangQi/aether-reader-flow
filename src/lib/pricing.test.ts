import { describe, it, expect } from 'vitest';
import { getPricing, listKnownModels } from './pricing';

describe('pricing', () => {
  it('returns exact entry for known models', () => {
    expect(getPricing('claude-sonnet-4-6').input).toBe(3.0);
    expect(getPricing('claude-haiku-4-5').output).toBe(4.0);
  });

  it('matches case-insensitively', () => {
    expect(getPricing('CLAUDE-SONNET-4-6').input).toBe(3.0);
  });

  it('returns estimated fallback for unknown models', () => {
    const p = getPricing('totally-made-up-model-9000');
    expect(p.estimated).toBe(true);
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
  });

  it('lists known model ids', () => {
    const list = listKnownModels();
    expect(list).toContain('claude-sonnet-4-6');
    expect(list).toContain('gpt-4o');
    expect(list.length).toBeGreaterThan(5);
  });

  it('local models priced at 0', () => {
    expect(getPricing('llama-3.1-70b').input).toBe(0);
    expect(getPricing('llama-3.1-70b').output).toBe(0);
  });
});
