import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStorageHealth, requestPersistence } from './storage-debug';

const originalStorage = navigator.storage;
const originalIndexedDB = window.indexedDB;

describe('storage-debug utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: originalStorage,
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: originalIndexedDB,
    });
  });

  it('reports IndexedDB as unavailable without touching optional storage APIs', async () => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });

    await expect(checkStorageHealth()).resolves.toEqual({
      available: false,
      persistent: false,
      quota: null,
      databases: [],
      error: 'IndexedDB not available',
    });
  });

  it('keeps IndexedDB available when optional persistence, quota, and database listing fail', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: vi.fn().mockRejectedValue(new Error('persisted blocked')),
        estimate: vi.fn().mockRejectedValue(new Error('quota blocked')),
      },
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        databases: vi.fn().mockRejectedValue(new Error('databases blocked')),
      },
    });

    const health = await checkStorageHealth();

    expect(health).toMatchObject({
      available: true,
      persistent: false,
      quota: null,
      databases: [],
    });
    expect(health.error).toContain('Storage persistence check failed: persisted blocked');
    expect(health.error).toContain('Storage quota check failed: quota blocked');
    expect(health.error).toContain('IndexedDB database listing failed: databases blocked');
  });

  it('normalizes missing or invalid quota estimates to zero bytes', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({
          usage: Number.NaN,
          quota: -1,
        }),
      },
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        databases: vi.fn().mockResolvedValue([{ name: '' }, { name: 'aether' }]),
      },
    });

    await expect(checkStorageHealth()).resolves.toEqual({
      available: true,
      persistent: true,
      quota: { usage: 0, quota: 0 },
      databases: ['unknown', 'aether'],
      error: undefined,
    });
  });

  it('returns false when persistence requests are unsupported', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {},
    });

    await expect(requestPersistence()).resolves.toBe(false);
  });

  it('returns false when persistence requests are rejected by the browser', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: vi.fn().mockRejectedValue(new Error('permission denied')),
      },
    });

    await expect(requestPersistence()).resolves.toBe(false);
  });
});
