'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useReaderStore } from '@/stores/readerStore';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { ChapterNav } from './ChapterNav';
import { ChapterContent } from './ChapterContent';
import { SelectionPopover } from './SelectionPopover';
import { AISidebar } from './AISidebar';
import { ChapterSummaryPanel } from './ChapterSummaryPanel';
import { TimelinePanel } from './TimelinePanel';
import { QuickUnlockDialog } from './QuickUnlockDialog';
import { useTimelineStore } from '@/stores/timelineStore';
import { getVault } from '@/lib/ai-service-client';
import { Sparkles, Lock, MessageSquare, ScrollText } from 'lucide-react';

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
  } = useReaderStore();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const timelineOpen = useTimelineStore(s => s.panelOpen);
  const setTimelineOpen = useTimelineStore(s => s.setPanelOpen);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await new IndexedDBBookRepo().get(bookId);
      if (cancelled) return;
      if (b) setBook(b);
      const ch = await new IndexedDBChapterRepo().listByBook(bookId);
      if (cancelled) return;
      setChapters(ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, setBook, setChapters]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setVaultUnlocked(getVault().unlocked);
  }, [unlockOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openSidebarFresh = () => {
    setThreadAnchor(null);
    setSidebarOpen(true);
  };

  return (
    <div className="flex h-screen">
      <aside className="w-72 shrink-0 border-r border-divider p-4 overflow-y-auto">
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

      <main className="flex-1 overflow-y-auto relative">
        <div className="sticky top-0 z-10 flex items-center justify-end gap-2 px-6 py-3 backdrop-blur-md bg-[var(--color-background)]/80 border-b border-divider/50">
          <ToolbarButton
            onClick={() => setSummaryOpen(!summaryOpen)}
            icon={<Sparkles size={14} />}
            label="章节总结"
            active={summaryOpen}
          />
          <ToolbarButton
            onClick={openSidebarFresh}
            icon={<MessageSquare size={14} />}
            label="AI 对话"
            active={sidebarOpen}
          />
          <ToolbarButton
            onClick={() => setTimelineOpen(!timelineOpen)}
            icon={<ScrollText size={14} />}
            label="时间轴"
            active={timelineOpen}
          />
          <ToolbarButton
            onClick={() => setUnlockOpen(true)}
            icon={<Lock size={14} />}
            label={vaultUnlocked ? '已解锁' : '解锁 AI'}
            active={vaultUnlocked}
          />
        </div>

        <div className="py-12 px-8">
          <ChapterSummaryPanel />
          <ChapterContent />
        </div>
      </main>

      <AISidebar />
      <TimelinePanel />
      <SelectionPopover />
      <QuickUnlockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={() => setVaultUnlocked(true)}
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
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition ${
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
