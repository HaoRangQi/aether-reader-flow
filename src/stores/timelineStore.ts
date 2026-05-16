'use client';

/**
 * @fileoverview Zustand store for the Timeline panel.
 *
 * State:
 *   - panelOpen: whether the side panel is shown
 *   - filter: chapter/types
 *   - query: search string
 *   - entries: the current rendered list (reloaded via reload())
 *
 * Reactivity contract: callers MUST call `reload(bookId)` after mutating
 * filter/query. We don't auto-subscribe to filter changes inside the store
 * (which would couple it to a specific bookId) — the UI hook orchestrates.
 */

import { create } from 'zustand';
import type { TimelineEntry } from '@/types/domain';
import { TimelineService, type TimelineFilter } from '@/services/TimelineService';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';

interface TimelineState {
  entries: TimelineEntry[];
  filter: TimelineFilter;
  query: string;
  panelOpen: boolean;

  setPanelOpen: (open: boolean) => void;
  setFilter: (f: TimelineFilter) => void;
  setQuery: (q: string) => void;
  reload: (bookId: string) => Promise<void>;
  clear: () => void;
}

const svc = new TimelineService(new IndexedDBTimelineRepo());

export const useTimelineStore = create<TimelineState>((set, get) => ({
  entries: [],
  filter: {},
  query: '',
  panelOpen: false,

  setPanelOpen: panelOpen => set({ panelOpen }),
  setFilter: filter => set({ filter }),
  setQuery: query => set({ query }),

  reload: async bookId => {
    const { filter, query } = get();
    const entries = query
      ? await svc.search(bookId, query)
      : await svc.listForBook(bookId, filter);
    set({ entries });
  },

  clear: () => set({ entries: [], filter: {}, query: '' }),
}));
