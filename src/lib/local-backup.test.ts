import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb } from '@/adapters/storage/db';
import {
  LOCAL_BACKUP_TABLES,
  deserializeLocalBackupValue,
  exportLocalBackup,
  exportLocalBackupBlob,
  prepareLocalBackup,
  restorePreparedLocalBackup,
  serializeLocalBackupValue,
  type LocalBackup,
} from './local-backup';

describe('local backup export', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('exports all IndexedDB tables with metadata', async () => {
    const db = getDb();
    await db.books.put({
      id: 'b1',
      title: 'Book',
      fileName: 'book.pdf',
      totalPages: 1,
      totalChapters: 1,
      uploadedAt: new Date('2026-01-01T00:00:00Z'),
      language: 'zh',
      fileBlob: new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    });
    await db.configs.put({ key: 'theme', value: 'paper' });

    const backup = await exportLocalBackup();

    expect(backup).toMatchObject({
      app: 'aether-reader-flow',
      version: 1,
    });
    expect(Object.keys(backup.tables).sort()).toEqual([
      'annotations',
      'books',
      'chapters',
      'configs',
      'costRecords',
      'modelServices',
      'pages',
      'readingProgress',
      'readingSessions',
      'timeline',
    ]);
    expect(backup.tables.configs).toEqual([{ key: 'theme', value: 'paper' }]);
    expect(backup.tables.books[0]).toMatchObject({ id: 'b1' });
  });

  it('serializes Blob values into JSON-safe backup envelopes', async () => {
    await expect(
      serializeLocalBackupValue(new Blob(['pdf-bytes'], { type: 'application/pdf' })),
    ).resolves.toEqual({
      __type: 'Blob',
      mimeType: 'application/pdf',
      size: 9,
      dataBase64: 'cGRmLWJ5dGVz',
    });
  });

  it('returns a JSON blob that can be downloaded', async () => {
    const blob = await exportLocalBackupBlob();
    expect(blob.type).toBe('application/json');
    await expect(blob.text()).resolves.toContain('"app": "aether-reader-flow"');
  });

  it('deserializes nested Date and Blob envelopes without converting plain strings', async () => {
    const restored = await deserializeLocalBackupValue({
      createdAt: { __type: 'Date', value: '2026-01-01T00:00:00.000Z' },
      file: {
        __type: 'Blob',
        mimeType: 'text/plain',
        size: 5,
        dataBase64: 'aGVsbG8=',
      },
      value: '2026-01-01T00:00:00.000Z',
    }) as { createdAt: Date; file: Blob; value: string };

    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.file).toBeInstanceOf(Blob);
    await expect(restored.file.text()).resolves.toBe('hello');
    expect(restored.value).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects non-canonical serialized Date envelopes', async () => {
    await expect(deserializeLocalBackupValue({
      __type: 'Date',
      value: '2026-01-01',
    })).rejects.toThrow(/无效 Date/);
    await expect(deserializeLocalBackupValue({
      __type: 'Date',
      value: '2026-01-01T00:00:00Z',
    })).rejects.toThrow(/无效 Date/);
  });

  it('rejects malformed serialized value envelopes', async () => {
    await expect(deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text/plain',
      size: -1,
      dataBase64: '',
    })).rejects.toThrow(/无效 Blob/);
    await expect(deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text/plain',
      size: 1.5,
      dataBase64: 'AA==',
    })).rejects.toThrow(/无效 Blob/);
    await expect(deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text plain',
      size: 0,
      dataBase64: '',
    })).rejects.toThrow(/Blob MIME/);
    await expect(deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text/plain',
      size: 3,
      dataBase64: 'a Gk=',
    })).rejects.toThrow(/Blob base64/);
    await expect(deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text/plain',
      size: 3,
      dataBase64: 'abc',
    })).rejects.toThrow(/Blob base64/);
    await expect(deserializeLocalBackupValue({
      __type: 'Unknown',
      value: true,
    })).rejects.toThrow(/未知序列化类型/);
  });

  it('accepts empty and parameterized Blob MIME types', async () => {
    const emptyType = await deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: '',
      size: 0,
      dataBase64: '',
    }) as Blob;
    const parameterizedType = await deserializeLocalBackupValue({
      __type: 'Blob',
      mimeType: 'text/plain; charset=utf-8',
      size: 5,
      dataBase64: 'aGVsbG8=',
    }) as Blob;

    expect(emptyType.type).toBe('');
    expect(parameterizedType.type).toBe('text/plain; charset=utf-8');
  });

  it('rejects invalid backup envelopes', async () => {
    await expect(prepareLocalBackup({})).rejects.toThrow(/Aether Reader Flow/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      exportedAt: '2026-01-01',
    })).rejects.toThrow(/导出时间无效/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      exportedAt: '2026-01-01T00:00:00Z',
    })).rejects.toThrow(/导出时间无效/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: { ...emptyBackup().tables, unknown: [] },
    })).rejects.toThrow(/未知表/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: { ...emptyBackup().tables, books: [{ title: 'missing id' }] },
    })).rejects.toThrow(/缺失主键/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        pages: [{ id: 'p1', chapterId: 'missing', pageNumber: 1, text: '' }],
      },
    })).rejects.toThrow(/孤儿 chapterId/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [{
          id: 'b1',
          title: 'Bad Blob',
          fileName: 'b.pdf',
          totalPages: 1,
          totalChapters: 1,
          uploadedAt: { __type: 'Date', value: '2026-01-01T00:00:00.000Z' },
          language: 'zh',
          fileBlob: {
            __type: 'Blob',
            mimeType: 'application/pdf',
            size: 99,
            dataBase64: 'cGRm',
          },
        }],
      },
    })).rejects.toThrow(/Blob 大小不匹配/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [
          {
            id: 'duplicate',
            title: 'Book 1',
            fileName: '1.pdf',
            totalPages: 1,
            totalChapters: 1,
            uploadedAt: { __type: 'Date', value: '2026-01-01T00:00:00.000Z' },
            language: 'zh',
          },
          {
            id: 'duplicate',
            title: 'Book 2',
            fileName: '2.pdf',
            totalPages: 1,
            totalChapters: 1,
            uploadedAt: { __type: 'Date', value: '2026-01-01T00:00:00.000Z' },
            language: 'zh',
          },
        ],
      },
    })).rejects.toThrow(/重复主键/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [{
          id: 'b1',
          title: 'Bad book',
          fileName: 'bad.pdf',
          totalPages: 'one',
          totalChapters: 1,
          uploadedAt: { __type: 'Date', value: '2026-01-01T00:00:00.000Z' },
          language: 'zh',
        }],
      },
    })).rejects.toThrow(/字段 totalPages 无效/);
    await expect(prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [{
          id: 'b1',
          title: 'Invalid Date',
          fileName: 'invalid-date.pdf',
          totalPages: 1,
          totalChapters: 1,
          uploadedAt: new Date('not-a-date'),
          language: 'zh',
        }],
      },
    })).rejects.toThrow(/字段 uploadedAt 无效/);
  });

  it('restores a prepared backup by clearing and replacing all tables', async () => {
    const db = getDb();
    await db.books.put({
      id: 'old',
      title: 'Old',
      fileName: 'old.pdf',
      totalPages: 1,
      totalChapters: 1,
      uploadedAt: new Date('2026-01-01T00:00:00Z'),
      language: 'zh',
    });
    await db.configs.put({ key: 'old-config', value: true });

    const prepared = await prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [{
          id: 'new',
          title: 'New',
          fileName: 'new.pdf',
          totalPages: 1,
          totalChapters: 1,
          uploadedAt: { __type: 'Date', value: '2026-02-01T00:00:00.000Z' },
          language: 'zh',
        }],
        configs: [{ key: 'theme', value: 'paper' }],
      },
    });

    expect(prepared.preview.books).toBe(1);
    await restorePreparedLocalBackup(prepared);

    expect(await db.books.get('old')).toBeUndefined();
    expect((await db.books.get('new'))?.uploadedAt).toBeInstanceOf(Date);
    expect(await db.configs.get('old-config')).toBeUndefined();
    expect(await db.configs.get('theme')).toEqual({ key: 'theme', value: 'paper' });
  });

  it('rolls back restore when a bulk write fails', async () => {
    const db = getDb();
    await db.books.put({
      id: 'safe',
      title: 'Safe',
      fileName: 'safe.pdf',
      totalPages: 1,
      totalChapters: 1,
      uploadedAt: new Date('2026-01-01T00:00:00Z'),
      language: 'zh',
    });

    const prepared = await prepareLocalBackup({
      ...emptyBackup(),
      tables: {
        ...emptyBackup().tables,
        books: [{
          id: 'new',
          title: 'New',
          fileName: 'new.pdf',
          totalPages: 1,
          totalChapters: 1,
          uploadedAt: { __type: 'Date', value: '2026-02-01T00:00:00.000Z' },
          language: 'zh',
        }],
      },
    });
    prepared.restoredTables.configs = [{ value: 'missing key' }];

    await expect(restorePreparedLocalBackup(prepared)).rejects.toThrow();
    expect(await db.books.get('safe')).toBeDefined();
    expect(await db.books.get('new')).toBeUndefined();
  });

  it('rejects mutated prepared table payloads before clearing existing data', async () => {
    const db = getDb();
    await db.books.put({
      id: 'safe',
      title: 'Safe',
      fileName: 'safe.pdf',
      totalPages: 1,
      totalChapters: 1,
      uploadedAt: new Date('2026-01-01T00:00:00Z'),
      language: 'zh',
    });

    const prepared = await prepareLocalBackup(emptyBackup());
    prepared.restoredTables.books = [{
      id: 'bad-date',
      title: 'Bad Date',
      fileName: 'bad-date.pdf',
      totalPages: 1,
      totalChapters: 1,
      uploadedAt: new Date('not-a-date'),
      language: 'zh',
    }];

    await expect(restorePreparedLocalBackup(prepared)).rejects.toThrow(/字段 uploadedAt 无效/);
    expect(await db.books.get('safe')).toBeDefined();
    expect(await db.books.get('bad-date')).toBeUndefined();
  });
});

function emptyBackup(): LocalBackup {
  return {
    app: 'aether-reader-flow',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tables: Object.fromEntries(
      LOCAL_BACKUP_TABLES.map(tableName => [tableName, [] as unknown[]]),
    ) as unknown as LocalBackup['tables'],
  };
}
