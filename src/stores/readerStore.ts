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

export interface ReaderAnchor {
  chapterId: string;
  text: string;
  start?: number;
  end?: number;
  page?: number;
}

export interface AIThreadAnchor {
  threadId: string;
  originalText: string;
  type: TaskType;
}

const TASK_TYPES = new Set<TaskType>(['translate', 'explain', 'verify', 'summarize', 'chat']);

function isTaskType(type: unknown): type is TaskType {
  return typeof type === 'string' && TASK_TYPES.has(type as TaskType);
}

function normalizeOptionalPage(page: unknown): number | undefined {
  if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) return undefined;
  return Math.trunc(page);
}

function normalizeOffsetRange(
  start: unknown,
  end: unknown,
): { start: number; end: number } | null {
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return null;
  }

  const lower = Math.trunc(Math.min(start, end));
  const upper = Math.trunc(Math.max(start, end));
  if (upper <= lower) return null;
  return { start: lower, end: upper };
}

function normalizeSelection(selection: ReaderSelection | null): ReaderSelection | null {
  if (!selection) return null;
  const range = normalizeOffsetRange(selection.start, selection.end);
  if (!range) return null;

  return {
    text: typeof selection.text === 'string' ? selection.text : '',
    start: range.start,
    end: range.end,
    page: normalizeOptionalPage(selection.page),
  };
}

function normalizeAnchor(anchor: ReaderAnchor): ReaderAnchor {
  const range = normalizeOffsetRange(anchor.start, anchor.end);
  return {
    chapterId: anchor.chapterId,
    text: typeof anchor.text === 'string' ? anchor.text : '',
    ...(range ? { start: range.start, end: range.end } : {}),
    page: normalizeOptionalPage(anchor.page),
  };
}

function normalizeThreadAnchor(threadAnchor: AIThreadAnchor | null): AIThreadAnchor | null {
  if (!threadAnchor) return null;

  if (typeof threadAnchor.threadId !== 'string') return null;
  const threadId = threadAnchor.threadId.trim();
  if (!threadId || !isTaskType(threadAnchor.type)) return null;

  return {
    threadId,
    originalText: typeof threadAnchor.originalText === 'string' ? threadAnchor.originalText : '',
    type: threadAnchor.type,
  };
}

interface ReaderState {
  // Book / chapter
  book: Book | null;
  chapters: Chapter[];
  currentChapterId: string | null;
  setBook: (b: Book) => void;
  setChapters: (c: Chapter[], preferredChapterId?: string | null) => void;
  setChapter: (id: string) => void;
  currentChapter: () => Chapter | null;

  // Selection
  selection: ReaderSelection | null;
  setSelection: (s: ReaderSelection | null) => void;
  pendingAnchor: ReaderAnchor | null;
  jumpToAnchor: (a: ReaderAnchor) => void;
  clearPendingAnchor: () => void;

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
  setChapters: (chapters, preferredChapterId) => {
    const nextChapterId =
      chapters.find(c => c.id === preferredChapterId)?.id ?? chapters[0]?.id ?? null;

    set({
      chapters,
      currentChapterId: nextChapterId,
      selection: null,
      pendingAnchor: null,
    });
  },
  setChapter: currentChapterId => {
    const state = get();
    if (state.currentChapterId === currentChapterId) return;
    if (!state.chapters.some(c => c.id === currentChapterId)) return;

    set({
      currentChapterId,
      // Closing AI sidebar on chapter switch — most threads are scoped to a chapter.
      selection: null,
      pendingAnchor: null,
    });
  },
  currentChapter: () => {
    const { chapters, currentChapterId } = get();
    return chapters.find(c => c.id === currentChapterId) ?? null;
  },

  selection: null,
  setSelection: selection => set({ selection: normalizeSelection(selection) }),
  pendingAnchor: null,
  jumpToAnchor: anchor => {
    const pendingAnchor = normalizeAnchor(anchor);
    if (!get().chapters.some(c => c.id === pendingAnchor.chapterId)) return;

    set({
      currentChapterId: pendingAnchor.chapterId,
      pendingAnchor,
      selection: pendingAnchor.start !== undefined && pendingAnchor.end !== undefined
        ? {
            text: pendingAnchor.text,
            start: pendingAnchor.start,
            end: pendingAnchor.end,
            page: pendingAnchor.page,
          }
        : null,
    });
  },
  clearPendingAnchor: () => set({ pendingAnchor: null }),

  sidebarOpen: false,
  setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
  threadAnchor: null,
  setThreadAnchor: threadAnchor => set({ threadAnchor: normalizeThreadAnchor(threadAnchor) }),

  summaryOpen: false,
  setSummaryOpen: summaryOpen => set({ summaryOpen }),
}));

export function _resetReaderStoreForTests(): void {
  useReaderStore.setState({
    book: null,
    chapters: [],
    currentChapterId: null,
    selection: null,
    pendingAnchor: null,
    sidebarOpen: false,
    threadAnchor: null,
    summaryOpen: false,
  });
}
