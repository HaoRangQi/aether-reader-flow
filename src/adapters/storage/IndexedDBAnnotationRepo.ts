import { getDb } from './db';
import type { AnnotationInput, AnnotationRepo } from './interfaces';
import type { Annotation } from '@/types/domain';

function compareFiniteNumberAsc(a: number, b: number): number {
  const aFinite = Number.isFinite(a);
  const bFinite = Number.isFinite(b);
  if (aFinite && bFinite) return a - b;
  if (aFinite) return -1;
  if (bFinite) return 1;
  return 0;
}

function compareDateAsc(a: Date, b: Date): number {
  return compareFiniteNumberAsc(a.getTime(), b.getTime());
}

function compareDateDesc(a: Date, b: Date): number {
  const aTime = a.getTime();
  const bTime = b.getTime();
  const aFinite = Number.isFinite(aTime);
  const bFinite = Number.isFinite(bTime);
  if (aFinite && bFinite) return bTime - aTime;
  if (aFinite) return -1;
  if (bFinite) return 1;
  return 0;
}

export class IndexedDBAnnotationRepo implements AnnotationRepo {
  async create(input: AnnotationInput): Promise<Annotation> {
    const now = new Date();
    const annotation: Annotation = {
      ...input,
      id: input.id ?? `ann-${crypto.randomUUID()}`,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    await getDb().annotations.put(annotation);
    return annotation;
  }

  async get(id: string): Promise<Annotation | null> {
    return (await getDb().annotations.get(id)) ?? null;
  }

  async listByBook(bookId: string): Promise<Annotation[]> {
    const rows = await getDb().annotations.where('bookId').equals(bookId).toArray();
    return rows.sort((a, b) => {
      const byCreatedAt = compareDateDesc(a.createdAt, b.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;
      return a.id.localeCompare(b.id);
    });
  }

  async listByChapter(chapterId: string): Promise<Annotation[]> {
    const rows = await getDb().annotations.where('chapterId').equals(chapterId).toArray();
    return rows.sort((a, b) => {
      const byStart = compareFiniteNumberAsc(a.anchor.start, b.anchor.start);
      if (byStart !== 0) return byStart;
      const byCreatedAt = compareDateAsc(a.createdAt, b.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;
      return a.id.localeCompare(b.id);
    });
  }

  async update(
    id: string,
    patch: Partial<Omit<Annotation, 'id' | 'createdAt'>>,
  ): Promise<void> {
    await getDb().annotations.update(id, {
      ...patch,
      updatedAt: patch.updatedAt ?? new Date(),
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().annotations.delete(id);
  }
}
