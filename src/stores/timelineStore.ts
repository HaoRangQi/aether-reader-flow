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
let reloadRequestId = 0;

function normalizeQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  entries: [],
  filter: {},
  query: '',
  panelOpen: false,

  setPanelOpen: panelOpen => set({ panelOpen }),
  setFilter: filter => set({ filter }),
  setQuery: query => set({ query: normalizeQuery(query) }),

  reload: async bookId => {
    const requestId = ++reloadRequestId;
    const { filter, query } = get();
    const entries = query
      ? await svc.search(bookId, query, filter)
      : await svc.listForBook(bookId, filter);
    if (requestId === reloadRequestId) {
      set({ entries });
    }
  },

  clear: () => {
    reloadRequestId += 1;
    set({ entries: [], filter: {}, query: '' });
  },
}));

export function _resetTimelineStoreForTests(): void {
  reloadRequestId = 0;
  useTimelineStore.setState({ entries: [], filter: {}, query: '', panelOpen: false });
}
