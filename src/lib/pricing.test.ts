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

  it('normalizes surrounding whitespace', () => {
    expect(getPricing('  CLAUDE-SONNET-4-6\n').input).toBe(3.0);
  });

  it('returns estimated fallback for blank model ids', () => {
    const p = getPricing('   \t\n');
    expect(p.estimated).toBe(true);
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
  });

  it('returns estimated fallback for malformed runtime model ids', () => {
    for (const modelId of [null, undefined, 42, { id: 'gpt-4o' }, ['gpt-4o']]) {
      const p = getPricing(modelId);
      expect(p).toEqual({
        input: 1.0,
        output: 5.0,
        estimated: true,
      });
    }
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

  it('returns known model ids sorted without exposing internal state', () => {
    const list = listKnownModels();
    expect(list).toEqual([...list].sort());

    list.push('mutated-model');
    expect(listKnownModels()).not.toContain('mutated-model');
  });

  it('does not let known pricing mutations affect later lookups', () => {
    const p = getPricing('gpt-4o');
    p.input = 999;
    p.output = 999;
    p.estimated = true;

    expect(getPricing('gpt-4o')).toEqual({ input: 2.5, output: 10.0 });
  });

  it('does not let fallback mutations affect later lookups', () => {
    const p = getPricing('totally-made-up-model-9000');
    p.input = 999;
    p.output = 999;
    p.estimated = false;

    expect(getPricing('another-unknown-model')).toEqual({
      input: 1.0,
      output: 5.0,
      estimated: true,
    });
  });

  it('local models priced at 0', () => {
    expect(getPricing('llama-3.1-70b').input).toBe(0);
    expect(getPricing('llama-3.1-70b').output).toBe(0);
  });
});
