'use client';

import { useEffect, useMemo, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useReaderStore } from '@/stores/readerStore';
import type { Annotation, HighlightColor } from '@/types/domain';
import {
  Check,
  Highlighter,
  Search,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';

interface AnnotationPanelProps {
  open: boolean;
  onClose: () => void;
}

const COLOR_LABEL: Record<HighlightColor, string> = {
  important: '重要',
  question: '疑问',
  insight: '精彩',
  todo: '待查',
};

const COLOR_OPTIONS: HighlightColor[] = ['important', 'question', 'insight', 'todo'];

export function AnnotationPanel({ open, onClose }: AnnotationPanelProps) {
  const { book, chapters, jumpToAnchor } = useReaderStore();
  const annotations = useAnnotationStore(s =>
    book ? (s.byBook[book.id] ?? []) : [],
  );
  const loadBook = useAnnotationStore(s => s.loadBook);
  const updateAnnotation = useAnnotationStore(s => s.update);
  const deleteAnnotation = useAnnotationStore(s => s.delete);
  const [query, setQuery] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [type, setType] = useState<'all' | Annotation['type']>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [draftColor, setDraftColor] = useState<HighlightColor>('important');
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !book) return;
    void loadBook(book.id);
  }, [open, book, loadBook]);

  const chapterOrder = useMemo(
    () => new Map(chapters.map(chapter => [chapter.id, chapter.orderIndex])),
    [chapters],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return annotations
      .filter(annotation => {
        if (chapterId && annotation.chapterId !== chapterId) return false;
        if (type !== 'all' && annotation.type !== type) return false;
        if (!normalizedQuery) return true;
        return (
          annotation.anchor.quote.toLowerCase().includes(normalizedQuery) ||
          (annotation.note?.toLowerCase().includes(normalizedQuery) ?? false)
        );
      })
      .sort((a, b) => {
        const byChapter =
          (chapterOrder.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER) -
          (chapterOrder.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER);
        if (byChapter !== 0) return byChapter;
        return a.anchor.start - b.anchor.start;
      });
  }, [annotations, chapterId, chapterOrder, query, type]);

  if (!open || !book) return null;

  const startEdit = (annotation: Annotation) => {
    setActionError(null);
    setEditingId(annotation.id);
    setDraftNote(annotation.note ?? '');
    setDraftColor(annotation.color);
  };

  const saveEdit = async (annotation: Annotation) => {
    const note = draftNote.trim();
    setActionError(null);
    setSavingId(annotation.id);
    try {
      await updateAnnotation(
        annotation.id,
        {
          color: draftColor,
          note: note || undefined,
          type: note ? 'note' : 'highlight',
        },
        { chapterId: annotation.chapterId, bookId: annotation.bookId },
      );
      setEditingId(null);
    } catch (error) {
      setActionError(`批注保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async (annotation: Annotation) => {
    setActionError(null);
    setDeletingId(annotation.id);
    try {
      await deleteAnnotation(annotation.id, annotation.chapterId);
      setConfirmDeleteId(null);
    } catch (error) {
      setActionError(`批注删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const jump = (annotation: Annotation) => {
    jumpToAnchor({
      chapterId: annotation.chapterId,
      text: annotation.anchor.quote,
      start: annotation.anchor.start,
      end: annotation.anchor.end,
      page: annotation.anchor.page,
    });
  };

  return (
    <aside className="fixed inset-0 z-40 flex h-screen w-full flex-col border-l border-divider arf-anim-slide-right md:static md:w-96 md:shrink-0">
      <GlassPanel className="flex-1 m-2 flex flex-col rounded-2xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <div className="flex items-center gap-2">
            <Highlighter size={16} className="text-accent" />
            <h2 className="font-serif text-base">批注</h2>
            <span className="text-xs text-subtle">{filtered.length}/{annotations.length}</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
            aria-label="关闭批注"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-3 space-y-2 border-b border-divider">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-subtle" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索原文或笔记…"
              aria-label="搜索批注原文或笔记"
              aria-describedby="annotation-result-status"
              className="w-full bg-surface border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <select
            value={chapterId}
            onChange={e => setChapterId(e.target.value)}
            aria-label="按章节筛选批注"
            aria-describedby="annotation-result-status"
            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">全部章节</option>
            {chapters.map(chapter => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.orderIndex}. {chapter.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="按批注类型筛选">
            <FilterButton active={type === 'all'} onClick={() => setType('all')}>
              全部
            </FilterButton>
            <FilterButton active={type === 'highlight'} onClick={() => setType('highlight')}>
              高亮
            </FilterButton>
            <FilterButton active={type === 'note'} onClick={() => setType('note')}>
              笔记
            </FilterButton>
          </div>
          {actionError && (
            <div className="text-sm text-danger" role="alert">
              {actionError}
            </div>
          )}
        </div>

        <div
          id="annotation-result-status"
          className="flex-1 overflow-y-auto px-4 py-2"
          role="status"
          aria-live="polite"
          aria-label={filtered.length === 0 ? '批注空状态' : `批注结果，共 ${filtered.length} 条`}
        >
          {filtered.length === 0 ? (
            <div className="text-center text-subtle py-12 text-sm">
              {annotations.length === 0 ? '还没有高亮或笔记' : '没有匹配的批注'}
            </div>
          ) : (
            filtered.map(annotation => (
              <AnnotationRow
                key={annotation.id}
                annotation={annotation}
                chapterTitle={
                  chapters.find(chapter => chapter.id === annotation.chapterId)?.title ??
                  '未知章节'
                }
                editing={editingId === annotation.id}
                confirmingDelete={confirmDeleteId === annotation.id}
                saving={savingId === annotation.id}
                deleting={deletingId === annotation.id}
                draftNote={draftNote}
                draftColor={draftColor}
                onDraftNote={setDraftNote}
                onDraftColor={setDraftColor}
                onEdit={() => startEdit(annotation)}
                onCancel={() => setEditingId(null)}
                onSave={() => void saveEdit(annotation)}
                onJump={() => jump(annotation)}
                onDeleteRequest={() => setConfirmDeleteId(annotation.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => void confirmDelete(annotation)}
              />
            ))
          )}
        </div>
      </GlassPanel>
    </aside>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-2 py-1 rounded ${
        active ? 'bg-accent text-white' : 'bg-surface text-muted border border-border'
      }`}
    >
      {children}
    </button>
  );
}

function AnnotationRow({
  annotation,
  chapterTitle,
  editing,
  confirmingDelete,
  saving,
  deleting,
  draftNote,
  draftColor,
  onDraftNote,
  onDraftColor,
  onEdit,
  onCancel,
  onSave,
  onJump,
  onDeleteRequest,
  onCancelDelete,
  onConfirmDelete,
}: {
  annotation: Annotation;
  chapterTitle: string;
  editing: boolean;
  confirmingDelete: boolean;
  saving: boolean;
  deleting: boolean;
  draftNote: string;
  draftColor: HighlightColor;
  onDraftNote: (note: string) => void;
  onDraftColor: (color: HighlightColor) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onJump: () => void;
  onDeleteRequest: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const locationLabel = annotation.anchor.page
    ? `第 ${annotation.anchor.page} 页，位置 ${annotation.anchor.start}`
    : `位置 ${annotation.anchor.start}`;

  return (
    <article className="border-b border-divider py-4 last:border-0">
      <div className="flex items-center justify-between gap-2 text-xs text-subtle mb-2">
        <button
          type="button"
          onClick={onJump}
          aria-label={`跳回原文：${chapterTitle}，${locationLabel}`}
          title={`跳回原文：${chapterTitle}，${locationLabel}`}
          className="min-w-0 text-left text-accent hover:underline line-clamp-1"
        >
          {chapterTitle} · {annotation.anchor.page ? `p.${annotation.anchor.page}` : `#${annotation.anchor.start}`}
        </button>
        <span className="shrink-0 inline-flex items-center gap-1">
          {annotation.type === 'note' ? <StickyNote size={12} /> : <Highlighter size={12} />}
          {COLOR_LABEL[annotation.color]}
        </span>
      </div>

      <button
        type="button"
        onClick={onJump}
        aria-label={`跳回批注原文：${annotation.anchor.quote.slice(0, 40)}`}
        title="跳回批注原文"
        className="block w-full text-left"
      >
        <blockquote className="text-sm text-muted border-l-2 border-divider pl-3 font-serif italic line-clamp-4 hover:text-foreground hover:border-accent transition">
          {annotation.anchor.quote}
        </blockquote>
      </button>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draftNote}
            onChange={e => onDraftNote(e.target.value)}
            rows={3}
            placeholder="添加或修改笔记…"
            aria-label="批注笔记"
            className="w-full resize-none bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <select
              value={draftColor}
              onChange={e => onDraftColor(e.target.value as HighlightColor)}
              aria-label="批注颜色"
              className="bg-surface border border-border rounded-md px-2 py-1 text-xs text-foreground"
            >
              {COLOR_OPTIONS.map(color => (
                <option key={color} value={color}>
                  {COLOR_LABEL[color]}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="text-xs text-muted hover:text-foreground"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={12} />
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {annotation.note && (
            <div className="mt-2 text-sm text-foreground whitespace-pre-wrap line-clamp-4">
              {annotation.note}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button type="button" onClick={onEdit} className="text-accent hover:underline">
              编辑
            </button>
            {confirmingDelete ? (
              <span className="inline-flex items-center gap-2 text-subtle" role="group" aria-label={`确认删除批注：${annotation.anchor.quote.slice(0, 40)}`}>
                <span>确认删除？</span>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={deleting}
                  className="text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? '删除中…' : '删除'}
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={deleting}
                  className="text-muted hover:text-foreground"
                >
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={onDeleteRequest}
                aria-label={`删除批注：${annotation.anchor.quote.slice(0, 40)}`}
                className="inline-flex items-center gap-1 text-subtle hover:text-danger"
              >
                <Trash2 size={12} />
                删除
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}
