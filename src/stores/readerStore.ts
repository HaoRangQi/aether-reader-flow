/**
 * @fileoverview Reader-view client state.
 *
 * Zustand-backed. Only the fields the Reader UI needs at-the-second:
 *   - currently loaded book + its chapters
 *   - which chapter is open
 *
 * Selection state lives in `SelectionPopover` local state because it is
 * ephemeral and many components don't need to subscribe.
 *
 * NOTE: Reader state is NOT persisted to IndexedDB; it's purely UI. Last
 * read chapter (`Book.lastReadAt` + a `lastChapterId` we may add later)
 * is a separate concern handled by the `BookRepo.update` calls.
 */
'use client';

import { create } from 'zustand';
import type { Book, Chapter } from '@/types/domain';

interface ReaderState {
  book: Book | null;
  chapters: Chapter[];
  currentChapterId: string | null;

  setBook: (b: Book) => void;
  setChapters: (c: Chapter[]) => void;
  setChapter: (id: string) => void;

  /** Convenience selector for the current chapter object. */
  currentChapter: () => Chapter | null;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  book: null,
  chapters: [],
  currentChapterId: null,

  setBook: book => set({ book }),

  setChapters: chapters =>
    set({
      chapters,
      currentChapterId: chapters[0]?.id ?? null,
    }),

  setChapter: currentChapterId => set({ currentChapterId }),

  currentChapter: () => {
    const { chapters, currentChapterId } = get();
    return chapters.find(c => c.id === currentChapterId) ?? null;
  },
}));
