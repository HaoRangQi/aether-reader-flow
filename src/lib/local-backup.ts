import { getDb } from '@/adapters/storage/db';

export const LOCAL_BACKUP_TABLES = [
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
] as const;

export type LocalBackupTableName = (typeof LOCAL_BACKUP_TABLES)[number];

export interface LocalBackup {
  app: 'aether-reader-flow';
  version: 1;
  exportedAt: string;
  tables: Record<LocalBackupTableName, unknown[]>;
}

export interface LocalBackupPreview {
  exportedAt: Date;
  books: number;
  annotations: number;
  timelineEntries: number;
  modelServices: number;
}

export interface PreparedLocalBackup {
  backup: LocalBackup;
  restoredTables: Record<LocalBackupTableName, unknown[]>;
  preview: LocalBackupPreview;
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  const db = getDb();
  await db.open();
  const tables = emptyTables();

  for (const table of db.tables) {
    if (!isLocalBackupTableName(table.name)) continue;
    const rows = await table.toArray();
    tables[table.name] = await Promise.all(rows.map(row => serializeLocalBackupValue(row)));
  }

  return {
    app: 'aether-reader-flow',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export async function exportLocalBackupBlob(): Promise<Blob> {
  const backup = await exportLocalBackup();
  return new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
}

export async function prepareLocalBackupText(text: string): Promise<PreparedLocalBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效 JSON。');
  }
  return await prepareLocalBackup(parsed);
}

export async function prepareLocalBackup(input: unknown): Promise<PreparedLocalBackup> {
  const backup = validateBackupEnvelope(input);
  const restoredTables = emptyTables();

  for (const tableName of LOCAL_BACKUP_TABLES) {
    restoredTables[tableName] = await Promise.all(
      backup.tables[tableName].map(row => deserializeLocalBackupValue(row)),
    );
  }

  validatePrimaryKeys(restoredTables);
  validateRowShapes(restoredTables);
  validateReferences(restoredTables);

  return {
    backup,
    restoredTables,
    preview: {
      exportedAt: new Date(backup.exportedAt),
      books: restoredTables.books.length,
      annotations: restoredTables.annotations.length,
      timelineEntries: restoredTables.timeline.length,
      modelServices: restoredTables.modelServices.length,
    },
  };
}

export async function restorePreparedLocalBackup(prepared: PreparedLocalBackup): Promise<void> {
  validateRestoredTables(prepared.restoredTables);
  const db = getDb();
  await db.open();
  validateRuntimeTables(db.tables.map(table => table.name));
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
    for (const table of db.tables) {
      if (!isLocalBackupTableName(table.name)) continue;
      await table.bulkPut(prepared.restoredTables[table.name]);
    }
  });
}

export async function serializeLocalBackupValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return {
      __type: 'Blob',
      mimeType: value.type,
      size: value.size,
      dataBase64: await blobToBase64(value),
    };
  }

  if (value instanceof Date) {
    return {
      __type: 'Date',
      value: value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return await Promise.all(value.map(item => serializeLocalBackupValue(item)));
  }

  if (isRecord(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nested]) => [
        key,
        await serializeLocalBackupValue(nested),
      ] as const),
    );
    return Object.fromEntries(entries);
  }

  return value;
}

export async function deserializeLocalBackupValue(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) {
    return await Promise.all(value.map(item => deserializeLocalBackupValue(item)));
  }

  if (!isRecord(value)) return value;

  if ('__type' in value) {
    if (value.__type === 'Date') {
      if (typeof value.value !== 'string') throw new Error('备份包含无效 Date。');
      if (!isCanonicalIsoDateString(value.value)) throw new Error('备份包含无效 Date。');
      const date = new Date(value.value);
      return date;
    }
    if (value.__type === 'Blob') {
      if (
        typeof value.mimeType !== 'string' ||
        typeof value.size !== 'number' ||
        !Number.isInteger(value.size) ||
        value.size < 0 ||
        typeof value.dataBase64 !== 'string'
      ) {
        throw new Error('备份包含无效 Blob。');
      }
      if (!isValidBlobMimeType(value.mimeType)) throw new Error('备份包含无效 Blob MIME 类型。');
      const bytes = base64ToBytes(value.dataBase64);
      if (bytes.byteLength !== value.size) throw new Error('备份 Blob 大小不匹配。');
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return new Blob([buffer], { type: value.mimeType });
    }
    throw new Error('备份包含未知序列化类型。');
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, nested]) => [
      key,
      await deserializeLocalBackupValue(nested),
    ] as const),
  );
  return Object.fromEntries(entries);
}

function validateBackupEnvelope(input: unknown): LocalBackup {
  if (!isRecord(input)) throw new Error('备份文件格式无效。');
  if (input.app !== 'aether-reader-flow') throw new Error('不是 Aether Reader Flow 备份。');
  if (input.version !== 1) throw new Error('不支持的备份版本。');
  if (typeof input.exportedAt !== 'string' || !isCanonicalIsoDateString(input.exportedAt)) {
    throw new Error('备份导出时间无效。');
  }
  if (!isRecord(input.tables)) throw new Error('备份缺少表数据。');

  const unknownTables = Object.keys(input.tables).filter(name => !isLocalBackupTableName(name));
  if (unknownTables.length > 0) {
    throw new Error(`备份包含未知表：${unknownTables.join(', ')}`);
  }
  for (const tableName of LOCAL_BACKUP_TABLES) {
    if (!Array.isArray(input.tables[tableName])) {
      throw new Error(`备份缺少表：${tableName}`);
    }
  }

  return input as unknown as LocalBackup;
}

function validatePrimaryKeys(tables: Record<LocalBackupTableName, unknown[]>): void {
  for (const tableName of LOCAL_BACKUP_TABLES) {
    const key = primaryKeyFor(tableName);
    const seen = new Set<string>();
    for (const row of tables[tableName]) {
      if (!isRecord(row) || typeof row[key] !== 'string' || !row[key]) {
        throw new Error(`备份表 ${tableName} 存在缺失主键的记录。`);
      }
      if (seen.has(row[key])) {
        throw new Error(`备份表 ${tableName} 存在重复主键：${row[key]}`);
      }
      seen.add(row[key]);
    }
  }
}

function validateRestoredTables(input: unknown): asserts input is Record<LocalBackupTableName, unknown[]> {
  if (!isRecord(input)) throw new Error('待恢复备份缺少表数据。');

  const unknownTables = Object.keys(input).filter(name => !isLocalBackupTableName(name));
  if (unknownTables.length > 0) {
    throw new Error(`待恢复备份包含未知表：${unknownTables.join(', ')}`);
  }

  for (const tableName of LOCAL_BACKUP_TABLES) {
    if (!Array.isArray(input[tableName])) {
      throw new Error(`待恢复备份缺少表：${tableName}`);
    }
  }

  const tables = input as Record<LocalBackupTableName, unknown[]>;
  validatePrimaryKeys(tables);
  validateRowShapes(tables);
  validateReferences(tables);
}

function validateRuntimeTables(tableNames: string[]): void {
  const knownTables = new Set(LOCAL_BACKUP_TABLES);
  const runtimeTables = new Set(tableNames);
  const unknownTables = tableNames.filter(name => !knownTables.has(name as LocalBackupTableName));
  const missingTables = LOCAL_BACKUP_TABLES.filter(name => !runtimeTables.has(name));

  if (unknownTables.length > 0 || missingTables.length > 0) {
    const details = [
      unknownTables.length > 0 ? `未知表：${unknownTables.join(', ')}` : null,
      missingTables.length > 0 ? `缺失表：${missingTables.join(', ')}` : null,
    ].filter(Boolean).join('；');
    throw new Error(`当前数据库结构和备份恢复白名单不一致，已取消恢复。${details}`);
  }
}

function validateReferences(tables: Record<LocalBackupTableName, unknown[]>): void {
  const bookIds = new Set(tables.books.filter(isRecord).map(row => row.id));
  const chapterIds = new Set(tables.chapters.filter(isRecord).map(row => row.id));

  for (const tableName of ['chapters', 'timeline', 'annotations', 'readingProgress', 'readingSessions'] as const) {
    for (const row of tables[tableName]) {
      if (isRecord(row) && typeof row.bookId === 'string' && !bookIds.has(row.bookId)) {
        throw new Error(`备份表 ${tableName} 存在孤儿 bookId。`);
      }
    }
  }

  for (const tableName of ['pages', 'timeline', 'annotations', 'readingProgress', 'readingSessions'] as const) {
    for (const row of tables[tableName]) {
      if (isRecord(row) && typeof row.chapterId === 'string' && !chapterIds.has(row.chapterId)) {
        throw new Error(`备份表 ${tableName} 存在孤儿 chapterId。`);
      }
    }
  }
}

function validateRowShapes(tables: Record<LocalBackupTableName, unknown[]>): void {
  for (const row of tables.books) {
    const book = expectRow('books', row);
    requireString(book, 'id', 'books');
    requireString(book, 'title', 'books');
    requireString(book, 'fileName', 'books');
    requireNumber(book, 'totalPages', 'books');
    requireNumber(book, 'totalChapters', 'books');
    requireDate(book, 'uploadedAt', 'books');
    requireString(book, 'language', 'books');
    requireOptionalDate(book, 'lastReadAt', 'books');
    requireOptionalDate(book, 'archivedAt', 'books');
  }

  for (const row of tables.chapters) {
    const chapter = expectRow('chapters', row);
    requireString(chapter, 'id', 'chapters');
    requireString(chapter, 'bookId', 'chapters');
    requireNumber(chapter, 'orderIndex', 'chapters');
    requireString(chapter, 'title', 'chapters');
    requireNumber(chapter, 'startPage', 'chapters');
    requireNumber(chapter, 'endPage', 'chapters');
    requireString(chapter, 'content', 'chapters');
    requireNumber(chapter, 'wordCount', 'chapters');
  }

  for (const row of tables.pages) {
    const page = expectRow('pages', row);
    requireString(page, 'id', 'pages');
    requireString(page, 'chapterId', 'pages');
    requireNumber(page, 'pageNumber', 'pages');
    requireString(page, 'text', 'pages');
  }

  for (const row of tables.annotations) {
    const annotation = expectRow('annotations', row);
    requireString(annotation, 'id', 'annotations');
    requireString(annotation, 'bookId', 'annotations');
    requireString(annotation, 'chapterId', 'annotations');
    requireString(annotation, 'type', 'annotations');
    requireRecord(annotation, 'anchor', 'annotations');
    requireString(annotation, 'color', 'annotations');
    requireDate(annotation, 'createdAt', 'annotations');
    requireDate(annotation, 'updatedAt', 'annotations');
  }

  for (const row of tables.readingProgress) {
    const progress = expectRow('readingProgress', row);
    requireString(progress, 'bookId', 'readingProgress');
    requireString(progress, 'chapterId', 'readingProgress');
    requireNumber(progress, 'chapterOrderIndex', 'readingProgress');
    requireString(progress, 'chapterTitle', 'readingProgress');
    requireNumber(progress, 'totalChapters', 'readingProgress');
    requireNumber(progress, 'chapterProgress', 'readingProgress');
    requireNumber(progress, 'overallProgress', 'readingProgress');
    requireDate(progress, 'updatedAt', 'readingProgress');
  }

  for (const row of tables.readingSessions) {
    const session = expectRow('readingSessions', row);
    requireString(session, 'id', 'readingSessions');
    requireString(session, 'bookId', 'readingSessions');
    requireString(session, 'chapterId', 'readingSessions');
    requireDate(session, 'startedAt', 'readingSessions');
    requireDate(session, 'endedAt', 'readingSessions');
    requireNumber(session, 'durationMs', 'readingSessions');
  }

  for (const row of tables.timeline) {
    const entry = expectRow('timeline', row);
    requireString(entry, 'id', 'timeline');
    requireString(entry, 'bookId', 'timeline');
    requireString(entry, 'chapterId', 'timeline');
    requireDate(entry, 'timestamp', 'timeline');
    requireString(entry, 'type', 'timeline');
    requireString(entry, 'originalText', 'timeline');
    requireString(entry, 'aiModel', 'timeline');
    requireString(entry, 'aiResponse', 'timeline');
    requireRecord(entry, 'costTokens', 'timeline');
    requireNumber(entry, 'costAmount', 'timeline');
    requireString(entry, 'persona', 'timeline');
  }

  for (const row of tables.modelServices) {
    const service = expectRow('modelServices', row);
    requireString(service, 'id', 'modelServices');
    requireString(service, 'name', 'modelServices');
    requireString(service, 'protocol', 'modelServices');
    requireString(service, 'baseUrl', 'modelServices');
    requireString(service, 'apiKeyCipher', 'modelServices');
    requireBoolean(service, 'enabled', 'modelServices');
    requireStringArray(service, 'enabledModels', 'modelServices');
    requireDate(service, 'createdAt', 'modelServices');
  }

  for (const row of tables.costRecords) {
    const record = expectRow('costRecords', row);
    requireString(record, 'id', 'costRecords');
    requireDate(record, 'timestamp', 'costRecords');
    requireString(record, 'model', 'costRecords');
    requireRecord(record, 'tokens', 'costRecords');
    requireNumber(record, 'amountUSD', 'costRecords');
    requireString(record, 'taskType', 'costRecords');
  }
}

function primaryKeyFor(tableName: LocalBackupTableName): string {
  if (tableName === 'configs') return 'key';
  if (tableName === 'readingProgress') return 'bookId';
  return 'id';
}

function emptyTables(): Record<LocalBackupTableName, unknown[]> {
  return Object.fromEntries(
    LOCAL_BACKUP_TABLES.map(tableName => [tableName, [] as unknown[]]),
  ) as unknown as Record<LocalBackupTableName, unknown[]>;
}

function isLocalBackupTableName(value: string): value is LocalBackupTableName {
  return (LOCAL_BACKUP_TABLES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectRow(tableName: LocalBackupTableName, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`备份表 ${tableName} 存在无效记录。`);
  return value;
}

function requireString(row: Record<string, unknown>, field: string, tableName: string): void {
  if (typeof row[field] !== 'string') throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
}

function requireStringArray(row: Record<string, unknown>, field: string, tableName: string): void {
  if (!Array.isArray(row[field]) || !row[field].every(item => typeof item === 'string')) {
    throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
  }
}

function requireNumber(row: Record<string, unknown>, field: string, tableName: string): void {
  if (typeof row[field] !== 'number' || !Number.isFinite(row[field])) {
    throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
  }
}

function requireBoolean(row: Record<string, unknown>, field: string, tableName: string): void {
  if (typeof row[field] !== 'boolean') throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
}

function requireDate(row: Record<string, unknown>, field: string, tableName: string): void {
  if (!(row[field] instanceof Date) || Number.isNaN(row[field].getTime())) {
    throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
  }
}

function requireOptionalDate(row: Record<string, unknown>, field: string, tableName: string): void {
  if (
    row[field] !== undefined &&
    (!(row[field] instanceof Date) || Number.isNaN(row[field].getTime()))
  ) {
    throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
  }
}

function requireRecord(row: Record<string, unknown>, field: string, tableName: string): void {
  if (!isRecord(row[field])) throw new Error(`备份表 ${tableName} 字段 ${field} 无效。`);
}

function isValidBlobMimeType(value: string): boolean {
  if (value === '') return true;
  if (value.trim() !== value || /[\r\n]/.test(value)) return false;
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;\s*[a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+-]+)*$/.test(value);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!isCanonicalBase64(value)) throw new Error('备份包含无效 Blob base64。');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error('备份包含无效 Blob base64。');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isCanonicalBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  return true;
}

function isCanonicalIsoDateString(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
