import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('exposes IndexedDB via fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).not.toBeNull();
  });

  it('exposes Web Crypto', () => {
    expect(typeof crypto.subtle).toBe('object');
  });
});
