export type UploadBatchItemStatus = 'pending' | 'parsing' | 'done' | 'failed';

export interface UploadProgressFile {
  name: string;
  size: number;
}

export interface UploadBatchItem {
  id: string;
  name: string;
  size: number;
  status: UploadBatchItemStatus;
  format?: string;
  detail?: string;
}

const UPLOAD_BATCH_ITEM_STATUSES: UploadBatchItemStatus[] = ['pending', 'parsing', 'done', 'failed'];
const MAX_FORMAT_LABEL_LENGTH = 24;
const MAX_DETAIL_LENGTH = 240;

function normalizeUploadFileName(name: string): { idPart: string; displayName: string } {
  const displayName = name.trim().replace(/\s+/g, ' ');
  return {
    idPart: displayName || 'unnamed',
    displayName: displayName || '?',
  };
}

function normalizeUploadFileSize(size: number): number {
  if (!Number.isFinite(size) || size < 0) return 0;
  return size;
}

function isUploadBatchItemStatus(value: unknown): value is UploadBatchItemStatus {
  return UPLOAD_BATCH_ITEM_STATUSES.includes(value as UploadBatchItemStatus);
}

function progressStatusOf(item: UploadBatchItem): UploadBatchItemStatus {
  return isUploadBatchItemStatus(item.status) ? item.status : 'pending';
}

function normalizeOptionalLabel(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.trim().replace(/\s+/g, ' ');
  if (!label) return undefined;
  return label.slice(0, maxLength);
}

function isUploadBatchItemPatch(value: unknown): value is Partial<Omit<UploadBatchItem, 'id' | 'name' | 'size'>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createUploadBatch(files: UploadProgressFile[]): UploadBatchItem[] {
  return files.map((file, index) => {
    const name = normalizeUploadFileName(file.name);
    const size = normalizeUploadFileSize(file.size);
    return {
      id: `${index}:${name.idPart}:${size}`,
      name: name.displayName,
      size,
      status: 'pending',
    };
  });
}

export function updateUploadBatchItem(
  items: UploadBatchItem[],
  id: string,
  patch: Partial<Omit<UploadBatchItem, 'id' | 'name' | 'size'>>,
): UploadBatchItem[] {
  if (!isUploadBatchItemPatch(patch)) return items;

  return items.map(item => {
    if (item.id !== id) return item;

    const next: UploadBatchItem = { ...item };
    if ('status' in patch && isUploadBatchItemStatus(patch.status)) {
      next.status = patch.status;
      if (patch.status !== 'failed' && !('detail' in patch)) {
        delete next.detail;
      }
    }
    if ('format' in patch) {
      const format = normalizeOptionalLabel(patch.format, MAX_FORMAT_LABEL_LENGTH);
      if (format) next.format = format;
      else delete next.format;
    }
    if ('detail' in patch) {
      const detail = normalizeOptionalLabel(patch.detail, MAX_DETAIL_LENGTH);
      if (detail) next.detail = detail;
      else delete next.detail;
    }
    return next;
  });
}

export function uploadBatchPercent(items: UploadBatchItem[]): number {
  if (items.length === 0) return 0;
  const completed = items.filter(item => {
    const status = progressStatusOf(item);
    return status === 'done' || status === 'failed';
  }).length;
  return Math.round((completed / items.length) * 100);
}

export function uploadBatchSummary(items: UploadBatchItem[]): {
  total: number;
  done: number;
  failed: number;
  pending: number;
  parsing: number;
} {
  const summary = {
    total: items.length,
    done: 0,
    failed: 0,
    pending: 0,
    parsing: 0,
  };

  for (const item of items) {
    summary[progressStatusOf(item)]++;
  }

  return {
    ...summary,
  };
}
