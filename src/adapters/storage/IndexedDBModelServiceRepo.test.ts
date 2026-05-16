import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from './db';
import { IndexedDBModelServiceRepo } from './IndexedDBModelServiceRepo';
import type { ModelService } from '@/types/domain';

const mk = (id: string, name: string): ModelService => ({
  id,
  name,
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKeyCipher: 'fake-cipher',
  enabled: true,
  enabledModels: ['claude-sonnet-4-6'],
  createdAt: new Date(),
});

describe('IndexedDBModelServiceRepo', () => {
  let repo: IndexedDBModelServiceRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBModelServiceRepo();
  });

  it('creates and retrieves by id', async () => {
    await repo.create(mk('s1', 'Anthropic'));
    expect((await repo.get('s1'))?.name).toBe('Anthropic');
  });

  it('lists alphabetically by name', async () => {
    await repo.create(mk('s2', 'Zeta'));
    await repo.create(mk('s1', 'Alpha'));
    const list = await repo.list();
    expect(list.map(s => s.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('updates a service partial', async () => {
    await repo.create(mk('s1', 'Orig'));
    await repo.update('s1', { name: 'Renamed' });
    expect((await repo.get('s1'))?.name).toBe('Renamed');
  });

  it('deletes a service', async () => {
    await repo.create(mk('s1', 'X'));
    await repo.delete('s1');
    expect(await repo.get('s1')).toBeNull();
  });

  it('does not leak plaintext (cipher stored as-is)', async () => {
    await repo.create({ ...mk('s1', 'X'), apiKeyCipher: 'opaque-blob' });
    expect((await repo.get('s1'))?.apiKeyCipher).toBe('opaque-blob');
  });
});
