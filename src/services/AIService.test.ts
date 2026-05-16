import { describe, it, expect } from 'vitest';
import { AIService } from './AIService';

describe('AIService.parseVerifyResponse', () => {
  it('parses a clean JSON fence', () => {
    const text = 'Some prose...\n```json\n{"summary":"x","supporting":[],"opposing":[],"verdict":"contested","confidence":"medium"}\n```';
    const r = AIService.parseVerifyResponse(text);
    expect(r?.verdict).toBe('contested');
    expect(r?.confidence).toBe('medium');
    expect(r?.summary).toBe('x');
  });

  it('parses JSON without fence', () => {
    const text = 'Prefix...\n{"summary":"y","supporting":[{"url":"http://x","title":"t","snippet":"s"}],"opposing":[],"verdict":"widely_accepted","confidence":"high"}';
    const r = AIService.parseVerifyResponse(text);
    expect(r?.verdict).toBe('widely_accepted');
    expect(r?.supporting.length).toBe(1);
  });

  it('returns null on missing verdict', () => {
    expect(AIService.parseVerifyResponse('{"summary":"x"}')).toBeNull();
  });

  it('returns null on no JSON', () => {
    expect(AIService.parseVerifyResponse('plain text only')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(AIService.parseVerifyResponse('{ broken json')).toBeNull();
  });

  it('handles missing fields with sensible defaults', () => {
    const r = AIService.parseVerifyResponse(
      '{"verdict":"insufficient","confidence":"low"}',
    );
    expect(r?.summary).toBe('');
    expect(r?.supporting).toEqual([]);
    expect(r?.opposing).toEqual([]);
  });
});
