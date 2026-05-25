import { describe, it, expect } from 'vitest';
import { NullSyncAdapter } from './NullSyncAdapter';
import type { SyncAdapter } from './types';

describe('NullSyncAdapter', () => {
  const adapter = new NullSyncAdapter();

  it('pushAll resolves without effect', async () => {
    await expect(adapter.pushAll()).resolves.toBeUndefined();
  });

  it('pullAll resolves without effect', async () => {
    await expect(adapter.pullAll()).resolves.toBeUndefined();
  });

  it('satisfies the SyncAdapter contract without returning status', async () => {
    const syncAdapter: SyncAdapter = new NullSyncAdapter();

    const result = await Promise.all([
      syncAdapter.pushAll(),
      syncAdapter.pullAll(),
    ]);

    expect(result).toEqual([undefined, undefined]);
  });
});
