'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useReaderStore } from '@/stores/readerStore';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { IndexedDBReadingProgressRepo } from '@/adapters/storage/IndexedDBReadingProgressRepo';
import { IndexedDBReadingSessionRepo } from '@/adapters/storage/IndexedDBReadingSessionRepo';
import { ChapterNav } from './ChapterNav';
import { ChapterContent } from './ChapterContent';
import { SelectionPopover } from './SelectionPopover';
import { SelectionContextMenu } from './SelectionContextMenu';
import { AISidebar } from './AISidebar';
import { ChapterSummaryPanel } from './ChapterSummaryPanel';
import { TimelinePanel } from './TimelinePanel';
import { AnnotationPanel } from './AnnotationPanel';
import { ReadingStatsPanel } from './ReadingStatsPanel';
import { QuickUnlockDialog } from './QuickUnlockDialog';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';
import { KeyboardShortcuts } from '@/components/shared/KeyboardShortcuts';
import { useTimelineStore } from '@/stores/timelineStore';
import { getVault } from '@/lib/ai-service-client';
import { buildReadingProgress, clampProgress } from '@/lib/reading-progress';
import {
  BarChart3,
  Highlighter,
  Sparkles,
  Lock,
  MessageSquare,
  ScrollText,
  Settings,
} from 'lucide-react';
import type { ReadingProgress } from '@/types/domain';

const READING_IDLE_MS = 2 * 60_000;
const READING_FLUSH_MS = 60_000;
const MIN_READING_SESSION_MS = 5_000;

/**
 * Reader view: three-column layout (nav + content + AI sidebar).
 * Toolbar above content offers: 章节总结 / AI 对话 / 解锁 AI.
 */
export function ReaderView({ bookId }: { bookId: string }) {
  const {
    book,
    setBook,
    setChapters,
    setSummaryOpen,
    setSidebarOpen,
    summaryOpen,
    sidebarOpen,
    setThreadAnchor,
    chapters,
    currentChapterId,
    currentChapter,
    pendingAnchor,
  } = useReaderStore();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [initialProgress, setInitialProgress] = useState<ReadingProgress | null>(null);
  const timelineOpen = useTimelineStore(s => s.panelOpen);
  const setTimelineOpen = useTimelineStore(s => s.setPanelOpen);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const appliedProgressRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingSessionStartRef = useRef<number | null>(null);
  const readingSessionChapterRef = useRef<string | null>(null);
  const lastReadingActivityRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await new IndexedDBBookRepo().get(bookId);
      if (cancelled) return;
      if (b) setBook(b);
      const [ch, progress] = await Promise.all([
        new IndexedDBChapterRepo().listByBook(bookId),
        new IndexedDBReadingProgressRepo().get(bookId),
      ]);
      if (cancelled) return;
      setInitialProgress(progress);
      setChapters(ch, progress?.chapterId);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, setBook, setChapters]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el || !currentChapterId) return;
    const id = window.requestAnimationFrame(() => {
      if (pendingAnchor?.chapterId === currentChapterId) return;
      const progressKey = `${bookId}:${currentChapterId}`;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (
        initialProgress?.chapterId === currentChapterId &&
        appliedProgressRef.current !== progressKey
      ) {
        el.scrollTop = Math.round(maxScroll * clampProgress(initialProgress.chapterProgress));
        appliedProgressRef.current = progressKey;
        return;
      }
      el.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(id);
  }, [bookId, currentChapterId, initialProgress, pendingAnchor]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el || !book || !currentChapterId) return;
    const chapter = currentChapter();
    if (!chapter) return;

    const persist = () => {
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      const chapterProgress = maxScroll <= 1 ? 1 : clampProgress(el.scrollTop / maxScroll);
      const progress = buildReadingProgress({
        bookId: book.id,
        chapter,
        totalChapters: chapters.length || book.totalChapters,
        chapterProgress,
      });
      void Promise.all([
        new IndexedDBReadingProgressRepo().upsert(progress),
        new IndexedDBBookRepo().update(book.id, { lastReadAt: progress.updatedAt }),
      ]);
    };

    const schedulePersist = () => {
      if (persistTimerRef.current) return;
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        persist();
      }, 800);
    };

    el.addEventListener('scroll', schedulePersist, { passive: true });
    return () => {
      el.removeEventListener('scroll', schedulePersist);
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      persist();
    };
  }, [book, chapters, currentChapter, currentChapterId]);

  useEffect(() => {
    if (!book || !currentChapterId) return;
    const startSession = (now: number) => {
      if (
        readingSessionStartRef.current === null ||
        readingSessionChapterRef.current !== currentChapterId
      ) {
        readingSessionStartRef.current = now;
        readingSessionChapterRef.current = currentChapterId;
      }
      lastReadingActivityRef.current = now;
    };
    const flushSession = (reason: 'active' | 'idle' | 'stop' = 'active') => {
      const start = readingSessionStartRef.current;
      const chapterId = readingSessionChapterRef.current;
      if (start === null || !chapterId) return;
      const now = Date.now();
      const activeEnd = Math.min(now, lastReadingActivityRef.current + READING_IDLE_MS);
      const endedAt = reason === 'idle' ? activeEnd : now;
      const durationMs = Math.max(0, endedAt - start);
      if (durationMs >= MIN_READING_SESSION_MS) {
        void new IndexedDBReadingSessionRepo().add({
          bookId: book.id,
          chapterId,
          startedAt: new Date(start),
          endedAt: new Date(endedAt),
          durationMs,
        });
      }
      readingSessionStartRef.current = reason === 'active' ? now : null;
      readingSessionChapterRef.current = reason === 'active' ? currentChapterId : null;
    };
    const markActivity = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      startSession(Date.now());
    };
    const flushIfActive = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        flushSession('stop');
        return;
      }
      if (Date.now() - lastReadingActivityRef.current > READING_IDLE_MS) {
        flushSession('idle');
        return;
      }
      flushSession('active');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushSession('stop');
      else markActivity();
    };
    const handleBlur = () => {
      flushSession('stop');
    };

    markActivity();
    const el = mainRef.current;
    el?.addEventListener('scroll', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('pointerdown', markActivity);
    window.addEventListener('focus', markActivity);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(flushIfActive, READING_FLUSH_MS);

    return () => {
      el?.removeEventListener('scroll', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('focus', markActivity);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
      flushSession('stop');
    };
  }, [book, currentChapterId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setVaultUnlocked(getVault().unlocked);
  }, [unlockOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openSidebarFresh = () => {
    setTimelineOpen(false);
    setThreadAnchor(null);
    setSidebarOpen(true);
  };

  const toggleSidebarPanel = () => {
    if (sidebarOpen) {
      setSidebarOpen(false);
      setThreadAnchor(null);
      return;
    }
    openSidebarFresh();
  };

  const toggleTimelinePanel = () => {
    const nextOpen = !timelineOpen;
    if (nextOpen) {
      setSidebarOpen(false);
      setThreadAnchor(null);
    }
    setTimelineOpen(nextOpen);
  };

  const closeUnlockDialog = useCallback(() => {
    setUnlockOpen(false);
  }, []);

  const markVaultUnlocked = useCallback(() => {
    setVaultUnlocked(true);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <KeyboardShortcuts />
      <aside className="hidden w-72 shrink-0 border-r border-divider p-4 overflow-y-auto md:block">
        <Link
          href="/"
          className="block text-sm text-muted hover:text-foreground mb-4"
        >
          ← 返回书架
        </Link>
        {book && (
          <div className="mb-4 pb-4 border-b border-divider">
            <div className="font-serif text-sm text-foreground line-clamp-2">
              {book.title}
            </div>
            {book.author && (
              <div className="text-xs text-subtle mt-1">{book.author}</div>
            )}
          </div>
        )}
        <ChapterNav />
      </aside>

      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto relative">
        <div className="sticky top-0 z-10 flex items-center justify-start gap-2 overflow-x-auto whitespace-nowrap px-3 py-3 backdrop-blur-md bg-[var(--color-background)]/80 border-b border-divider/50 md:justify-end md:px-6">
          <ToolbarButton
            onClick={() => setSummaryOpen(!summaryOpen)}
            icon={<Sparkles size={14} />}
            label="章节总结"
            active={summaryOpen}
          />
          <ToolbarButton
            onClick={toggleSidebarPanel}
            icon={<MessageSquare size={14} />}
            label="AI 对话"
            active={sidebarOpen}
          />
          <ToolbarButton
            onClick={toggleTimelinePanel}
            icon={<ScrollText size={14} />}
            label="时间轴"
            active={timelineOpen}
          />
          <ToolbarButton
            onClick={() => setAnnotationsOpen(open => !open)}
            icon={<Highlighter size={14} />}
            label="批注"
            active={annotationsOpen}
          />
          <ToolbarButton
            onClick={() => setStatsOpen(open => !open)}
            icon={<BarChart3 size={14} />}
            label="统计"
            active={statsOpen}
          />
          <ToolbarButton
            onClick={() => setUnlockOpen(true)}
            icon={<Lock size={14} />}
            label={vaultUnlocked ? '已解锁' : '解锁 AI'}
            active={vaultUnlocked}
          />
          <ToolbarButton
            onClick={() => setSettingsOpen(true)}
            icon={<Settings size={14} />}
            label="设置"
            active={false}
          />
        </div>

        <div className="px-4 py-8 sm:px-6 md:px-8 md:py-12">
          <ChapterContent onContextMenu={(x, y) => setContextMenu({ x, y })} />
        </div>
      </main>

      <ChapterSummaryPanel />
      <AISidebar />
      <TimelinePanel />
      <AnnotationPanel open={annotationsOpen} onClose={() => setAnnotationsOpen(false)} />
      <ReadingStatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      {contextMenu ? null : <SelectionPopover />}
      <SelectionContextMenu
        menuState={contextMenu}
        onClose={() => setContextMenu(null)}
      />
      <QuickUnlockDialog
        open={unlockOpen}
        onClose={closeUnlockDialog}
        onUnlocked={markVaultUnlocked}
      />
      <ReaderSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1.5 rounded-md transition ${
        active
          ? 'bg-accent text-white'
          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
