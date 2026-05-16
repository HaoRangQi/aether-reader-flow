import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBConfigRepo } from './IndexedDBConfigRepo';
import { resetDb } from './db';

describe('IndexedDBConfigRepo', () => {
  let repo: IndexedDBConfigRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBConfigRepo();
  });

  it('round-trips a complex object', async () => {
    await repo.set('theme', { id: 'sheepskin', mode: 'dark' });
    expect(await repo.get('theme')).toEqual({ id: 'sheepskin', mode: 'dark' });
  });

  it('round-trips a primitive', async () => {
    await repo.set('budget', 300);
    expect(await repo.get<number>('budget')).toBe(300);
  });

  it('returns null for missing key', async () => {
    expect(await repo.get('missing')).toBeNull();
  });

  it('overwrites on subsequent set', async () => {
    await repo.set('k', 1);
    await repo.set('k', 2);
    expect(await repo.get<number>('k')).toBe(2);
  });

  it('deletes a key', async () => {
    await repo.set('k', 1);
    await repo.delete('k');
    expect(await repo.get('k')).toBeNull();
  });

  it('delete is idempotent', async () => {
    await expect(repo.delete('never')).resolves.toBeUndefined();
  });
});
