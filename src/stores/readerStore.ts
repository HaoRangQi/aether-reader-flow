/**
 * @fileoverview Reader-view client state.
 *
 * Includes:
 *   - book + chapters + currentChapterId (P1)
 *   - selection (anchor for AI calls)        (P2 added)
 *   - aiSidebarOpen / activeThread           (P2 added)
 *   - summaryPanelOpen                       (P2 added)
 */
'use client';

import { create } from 'zustand';
import type { Book, Chapter, TaskType } from '@/types/domain';

export interface ReaderSelection {
  text: string;
  /** Character offset within `Chapter.content` (start). */
  start: number;
  /** Character offset within `Chapter.content` (end). */
  end: number;
  /** Approximate page number, if we can infer it. */
  page?: number;
}

export interface AIThreadAnchor {
  threadId: string;
  originalText: string;
  type: TaskType;
}

interface ReaderState {
  // Book / chapter
  book: Book | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  setBook: (b: Book) => void;
  setChapters: (c: Chapter[]) => void;
  setChapter: (id: string) => void;
  currentChapter: () => Chapter | null;

  // Selection
  selection: ReaderSelection | null;
  setSelection: (s: ReaderSelection | null) => void;

  // AI sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  threadAnchor: AIThreadAnchor | null;
  setThreadAnchor: (a: AIThreadAnchor | null) => void;

  // Chapter summary panel
  summaryOpen: boolean;
  setSummaryOpen: (open: boolean) => void;
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
  setChapter: currentChapterId =>
    set({
      currentChapterId,
      // Closing AI sidebar on chapter switch — most threads are scoped to a chapter.
      selection: null,
    }),
  currentChapter: () => {
    const { chapters, currentChapterId } = get();
    return chapters.find(c => c.id === currentChapterId) ?? null;
  },

  selection: null,
  setSelection: selection => set({ selection }),

  sidebarOpen: false,
  setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
  threadAnchor: null,
  setThreadAnchor: threadAnchor => set({ threadAnchor }),

  summaryOpen: false,
  setSummaryOpen: summaryOpen => set({ summaryOpen }),
}));
