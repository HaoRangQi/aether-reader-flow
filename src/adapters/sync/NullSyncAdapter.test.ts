import { describe, it, expect } from 'vitest';
import { NullSyncAdapter } from './NullSyncAdapter';

describe('NullSyncAdapter', () => {
  const adapter = new NullSyncAdapter();

  it('pushAll resolves without effect', async () => {
    await expect(adapter.pushAll()).resolves.toBeUndefined();
  });

  it('pullAll resolves without effect', async () => {
    await expect(adapter.pullAll()).resolves.toBeUndefined();
  });
});
