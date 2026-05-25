import { describe, expect, it } from 'vitest';
import {
  createUploadBatch,
  updateUploadBatchItem,
  uploadBatchPercent,
  uploadBatchSummary,
} from './upload-progress';

describe('upload progress helpers', () => {
  it('creates stable pending items from files', () => {
    const items = createUploadBatch([
      { name: 'a.pdf', size: 10 },
      { name: '', size: 0 },
    ]);

    expect(items).toEqual([
      { id: '0:a.pdf:10', name: 'a.pdf', size: 10, status: 'pending' },
      { id: '1:unnamed:0', name: '?', size: 0, status: 'pending' },
    ]);
  });

  it('normalizes display names and invalid sizes for durable progress rows', () => {
    const items = createUploadBatch([
      { name: '  messy\nbook\tname.pdf  ', size: Number.NaN },
      { name: 'negative.epub', size: -10 },
    ]);

    expect(items).toEqual([
      { id: '0:messy book name.pdf:0', name: 'messy book name.pdf', size: 0, status: 'pending' },
      { id: '1:negative.epub:0', name: 'negative.epub', size: 0, status: 'pending' },
    ]);
  });

  it('updates a single item without mutating the original array', () => {
    const items = createUploadBatch([{ name: 'a.pdf', size: 10 }]);
    const next = updateUploadBatchItem(items, items[0].id, {
      status: 'done',
      format: 'PDF',
    });

    expect(items[0].status).toBe('pending');
    expect(next[0]).toMatchObject({ status: 'done', format: 'PDF' });
  });

  it('ignores invalid patch fields and normalizes labels for durable upload rows', () => {
    const items = createUploadBatch([{ name: 'a.pdf', size: 10 }]);
    const failed = updateUploadBatchItem(items, items[0].id, {
      status: 'failed',
      format: '  PDF\nDocument  ',
      detail: `  ${'x'.repeat(300)}  `,
    });
    const invalidPatch = updateUploadBatchItem(failed, items[0].id, {
      status: 'unknown',
      format: '   ',
      detail: 123,
    } as never);

    expect(failed[0]).toMatchObject({
      status: 'failed',
      format: 'PDF Document',
      detail: 'x'.repeat(240),
    });
    expect(invalidPatch[0]).toEqual({
      id: items[0].id,
      name: 'a.pdf',
      size: 10,
      status: 'failed',
    });
  });

  it('ignores malformed runtime patches without changing upload rows', () => {
    const items = createUploadBatch([{ name: 'a.pdf', size: 10 }]);
    const invalidPatches = [null, undefined, 'done', ['failed']];

    for (const patch of invalidPatches) {
      expect(updateUploadBatchItem(items, items[0].id, patch as never)).toBe(items);
    }
  });

  it('clears stale failure details when an item recovers to a non-failed status', () => {
    const items = createUploadBatch([{ name: 'a.pdf', size: 10 }]);
    const failed = updateUploadBatchItem(items, items[0].id, {
      status: 'failed',
      detail: 'bad file',
    });
    const recovered = updateUploadBatchItem(failed, items[0].id, { status: 'parsing' });

    expect(recovered[0]).toEqual({
      id: items[0].id,
      name: 'a.pdf',
      size: 10,
      status: 'parsing',
    });
  });

  it('calculates percent and summary from terminal statuses', () => {
    const items = createUploadBatch([
      { name: 'a.pdf', size: 10 },
      { name: 'b.epub', size: 20 },
      { name: 'c.txt', size: 30 },
    ]);
    const next = updateUploadBatchItem(
      updateUploadBatchItem(items, items[0].id, { status: 'done' }),
      items[1].id,
      { status: 'failed', detail: 'bad file' },
    );

    expect(uploadBatchPercent(next)).toBe(67);
    expect(uploadBatchSummary(next)).toEqual({
      total: 3,
      done: 1,
      failed: 1,
      pending: 1,
      parsing: 0,
    });
  });

  it('treats unknown persisted statuses as pending for progress math', () => {
    const items = createUploadBatch([
      { name: 'a.pdf', size: 10 },
      { name: 'b.epub', size: 20 },
    ]);
    const dirtyItems = [
      { ...items[0], status: 'done' },
      { ...items[1], status: 'paused' },
    ] as never;

    expect(uploadBatchPercent(dirtyItems)).toBe(50);
    expect(uploadBatchSummary(dirtyItems)).toEqual({
      total: 2,
      done: 1,
      failed: 0,
      pending: 1,
      parsing: 0,
    });
  });
});
