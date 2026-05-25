'use client';

import { create } from 'zustand';
import { IndexedDBAnnotationRepo } from '@/adapters/storage/IndexedDBAnnotationRepo';
import type { AnnotationInput } from '@/adapters/storage/interfaces';
import type { Annotation, HighlightColor } from '@/types/domain';

interface AnnotationState {
  byChapter: Record<string, Annotation[]>;
  byBook: Record<string, Annotation[]>;
  loadChapter: (chapterId: string) => Promise<void>;
  loadBook: (bookId: string) => Promise<void>;
  create: (input: AnnotationInput) => Promise<Annotation>;
  update: (
    id: string,
    patch: { note?: string; color?: HighlightColor; type?: Annotation['type'] },
    context: { chapterId: string; bookId?: string },
  ) => Promise<void>;
  delete: (id: string, chapterId: string) => Promise<void>;
}

const repo = new IndexedDBAnnotationRepo();
let annotationLoadRequestId = 0;
const chapterLoadRequestIds = new Map<string, number>();
const bookLoadRequestIds = new Map<string, number>();

function collectBookIdsForAnnotation(
  state: Pick<AnnotationState, 'byBook' | 'byChapter'>,
  id: string,
  chapterId: string,
  knownBookId?: string,
): Set<string> {
  const bookIds = new Set<string>();
  if (knownBookId) bookIds.add(knownBookId);

  const cachedChapterAnnotation = state.byChapter[chapterId]?.find(
    annotation => annotation.id === id,
  );
  if (cachedChapterAnnotation?.bookId) bookIds.add(cachedChapterAnnotation.bookId);

  Object.entries(state.byBook).forEach(([bookId, annotations]) => {
    if (annotations.some(annotation => annotation.id === id)) bookIds.add(bookId);
  });

  return bookIds;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  byChapter: {},
  byBook: {},

  loadChapter: async chapterId => {
    const requestId = ++annotationLoadRequestId;
    chapterLoadRequestIds.set(chapterId, requestId);
    const annotations = await repo.listByChapter(chapterId);
    if (chapterLoadRequestIds.get(chapterId) === requestId) {
      set(state => ({
        byChapter: { ...state.byChapter, [chapterId]: annotations },
      }));
    }
  },

  loadBook: async bookId => {
    const requestId = ++annotationLoadRequestId;
    bookLoadRequestIds.set(bookId, requestId);
    const annotations = await repo.listByBook(bookId);
    if (bookLoadRequestIds.get(bookId) === requestId) {
      set(state => ({
        byBook: { ...state.byBook, [bookId]: annotations },
      }));
    }
  },

  create: async input => {
    const annotation = await repo.create(input);
    await get().loadChapter(annotation.chapterId);
    await get().loadBook(annotation.bookId);
    return annotation;
  },

  update: async (id, patch, context) => {
    const existing = context.bookId ? null : await repo.get(id);
    const cachedBookIds = collectBookIdsForAnnotation(
      get(),
      id,
      context.chapterId,
      context.bookId ?? existing?.bookId,
    );

    await repo.update(id, patch);
    await get().loadChapter(context.chapterId);
    await Promise.all(Array.from(cachedBookIds, bookId => get().loadBook(bookId)));
  },

  delete: async (id, chapterId) => {
    const existing = await repo.get(id);
    const cachedBookIds = collectBookIdsForAnnotation(
      get(),
      id,
      chapterId,
      existing?.bookId,
    );

    await repo.delete(id);
    await get().loadChapter(chapterId);
    await Promise.all(Array.from(cachedBookIds, bookId => get().loadBook(bookId)));
  },
}));

export function _resetAnnotationStoreForTests(): void {
  annotationLoadRequestId = 0;
  chapterLoadRequestIds.clear();
  bookLoadRequestIds.clear();
  useAnnotationStore.setState({ byChapter: {}, byBook: {} });
}
