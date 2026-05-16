import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBBookRepo } from './IndexedDBBookRepo';
import { resetDb } from './db';

describe('IndexedDBBookRepo', () => {
  let repo: IndexedDBBookRepo;

  beforeEach(async () => {
    await resetDb();
    repo = new IndexedDBBookRepo();
  });

  it('creates a book with auto-generated id and timestamp', async () => {
    const b = await repo.create({
      title: 'The Origin of Money',
      fileName: 'money.pdf',
      totalPages: 200,
      totalChapters: 12,
      language: 'zh',
    });
    expect(b.id).toMatch(/^book-/);
    expect(b.uploadedAt).toBeInstanceOf(Date);
    expect(b.title).toBe('The Origin of Money');
  });

  it('respects a caller-supplied id', async () => {
    const b = await repo.create({
      id: 'fixed-id',
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    expect(b.id).toBe('fixed-id');
  });

  it('lists books reverse-chronologically', async () => {
    await repo.create({
      title: 'A',
      fileName: 'a.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await new Promise(r => setTimeout(r, 5));
    await repo.create({
      title: 'B',
      fileName: 'b.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    const list = await repo.list();
    expect(list.map(b => b.title)).toEqual(['B', 'A']);
  });

  it('get returns null for unknown id', async () => {
    expect(await repo.get('does-not-exist')).toBeNull();
  });

  it('updates a book by id', async () => {
    const b = await repo.create({
      title: 'Orig',
      fileName: 'o.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await repo.update(b.id, { title: 'Renamed' });
    expect((await repo.get(b.id))?.title).toBe('Renamed');
  });

  it('deletes a book', async () => {
    const b = await repo.create({
      title: 'X',
      fileName: 'x.pdf',
      totalPages: 1,
      totalChapters: 1,
      language: 'zh',
    });
    await repo.delete(b.id);
    expect(await repo.get(b.id)).toBeNull();
  });

  it('delete is idempotent', async () => {
    await expect(repo.delete('never-existed')).resolves.toBeUndefined();
  });
});
