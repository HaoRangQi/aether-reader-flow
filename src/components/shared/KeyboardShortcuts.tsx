'use client';

/**
 * @fileoverview KeyboardShortcuts — mounted once inside ReaderView, sets up:
 *   - Cmd/Ctrl + B: toggle timeline panel
 *   - Cmd/Ctrl + D: flip light/dark mode
 *   - Cmd/Ctrl + Shift + S: open/close AI sidebar (S for "sidebar"; D is taken)
 *   - ArrowLeft / ArrowRight: previous / next chapter (not in inputs)
 *
 * Returns null — pure side-effect component.
 */

import { useEffect } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useConfigStore } from '@/stores/configStore';
import {
  isPlainArrowNavigation,
  matchShortcut,
  shouldHandleReaderShortcut,
} from '@/lib/keyboard-shortcuts';

export function KeyboardShortcuts() {
  const chapters = useReaderStore(s => s.chapters);
  const currentChapterId = useReaderStore(s => s.currentChapterId);
  const setChapter = useReaderStore(s => s.setChapter);
  const sidebarOpen = useReaderStore(s => s.sidebarOpen);
  const setSidebarOpen = useReaderStore(s => s.setSidebarOpen);

  const timelineOpen = useTimelineStore(s => s.panelOpen);
  const setTimelineOpen = useTimelineStore(s => s.setPanelOpen);

  const theme = useConfigStore(s => s.theme);
  const setTheme = useConfigStore(s => s.setTheme);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!shouldHandleReaderShortcut(e)) return;

      if (matchShortcut('meta+b', e)) {
        e.preventDefault();
        const nextOpen = !timelineOpen;
        if (nextOpen) setSidebarOpen(false);
        setTimelineOpen(nextOpen);
      } else if (matchShortcut('meta+shift+s', e)) {
        e.preventDefault();
        const nextOpen = !sidebarOpen;
        if (nextOpen) setTimelineOpen(false);
        setSidebarOpen(nextOpen);
      } else if (matchShortcut('meta+d', e)) {
        e.preventDefault();
        const nextMode = theme.mode === 'dark' ? 'light' : 'dark';
        void setTheme({ ...theme, mode: nextMode });
      } else if (isPlainArrowNavigation(e) && e.key === 'ArrowLeft') {
        const idx = chapters.findIndex(c => c.id === currentChapterId);
        if (idx > 0) setChapter(chapters[idx - 1].id);
      } else if (isPlainArrowNavigation(e) && e.key === 'ArrowRight') {
        const idx = chapters.findIndex(c => c.id === currentChapterId);
        if (idx >= 0 && idx < chapters.length - 1) {
          setChapter(chapters[idx + 1].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    chapters,
    currentChapterId,
    setChapter,
    sidebarOpen,
    setSidebarOpen,
    timelineOpen,
    setTimelineOpen,
    theme,
    setTheme,
  ]);

  return null;
}
