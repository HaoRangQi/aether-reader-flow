import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetAnnotationStoreForTests, useAnnotationStore } from '@/stores/annotationStore';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { AnnotationPanel } from './AnnotationPanel';
import type { Annotation, Book, Chapter } from '@/types/domain';

const book: Book = {
  id: 'book-1',
  title: '批注测试书',
  fileName: 'book.pdf',
  totalPages: 20,
  totalChapters: 2,
  uploadedAt: new Date('2026-05-24T00:00:00.000Z'),
  language: 'zh',
};

const chapters: Chapter[] = [
  {
    id: 'chapter-1',
    bookId: 'book-1',
    orderIndex: 1,
    title: '开篇',
    startPage: 1,
    endPage: 10,
    content: '',
    wordCount: 0,
  },
  {
    id: 'chapter-2',
    bookId: 'book-1',
    orderIndex: 2,
    title: '方法',
    startPage: 11,
    endPage: 20,
    content: '',
    wordCount: 0,
  },
];

function annotation(patch: Partial<Annotation>): Annotation {
  return {
    id: 'annotation-1',
    bookId: 'book-1',
    chapterId: 'chapter-1',
    type: 'highlight',
    color: 'important',
    anchor: { start: 10, end: 18, quote: '关键原文', page: 3 },
    createdAt: new Date('2026-05-24T08:00:00.000Z'),
    updatedAt: new Date('2026-05-24T08:00:00.000Z'),
    ...patch,
  };
}

describe('AnnotationPanel', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    _resetAnnotationStoreForTests();
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters(chapters);
    useAnnotationStore.setState({
      byBook: {
        'book-1': [
          annotation({ id: 'a1', type: 'highlight', anchor: { start: 10, end: 18, quote: '关键原文', page: 3 } }),
          annotation({
            id: 'a2',
            chapterId: 'chapter-2',
            type: 'note',
            color: 'question',
            note: '这里要复查',
            anchor: { start: 30, end: 36, quote: '复查片段', page: 12 },
          }),
        ],
      },
      loadBook: vi.fn(async () => undefined),
    });
  });

  it('exposes filters and result status for annotation review', () => {
    render(<AnnotationPanel open onClose={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: '搜索批注原文或笔记' })).toHaveAccessibleDescription(
      /关键原文/,
    );
    expect(screen.getByRole('combobox', { name: '按章节筛选批注' })).toBeInTheDocument();

    const typeGroup = screen.getByRole('group', { name: '按批注类型筛选' });
    expect(within(typeGroup).getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status', { name: '批注结果，共 2 条' })).toHaveTextContent('关键原文');
  });

  it('filters by type and announces empty filtered results', async () => {
    const user = userEvent.setup();
    render(<AnnotationPanel open onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: '搜索批注原文或笔记' }), '不存在');

    expect(screen.getByRole('status', { name: '批注空状态' })).toHaveTextContent('没有匹配的批注');
  });

  it('jumps back to the source anchor from annotation rows', async () => {
    const user = userEvent.setup();
    render(<AnnotationPanel open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '跳回原文：开篇，第 3 页，位置 10' }));

    expect(useReaderStore.getState().pendingAnchor).toEqual({
      chapterId: 'chapter-1',
      text: '关键原文',
      start: 10,
      end: 18,
      page: 3,
    });
  });

  it('requires explicit confirmation before deleting an annotation', async () => {
    const user = userEvent.setup();
    const deleteAnnotation = vi.fn(async () => undefined);
    useAnnotationStore.setState({ delete: deleteAnnotation });
    render(<AnnotationPanel open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '删除批注：关键原文' }));

    expect(deleteAnnotation).not.toHaveBeenCalled();
    const confirmGroup = screen.getByRole('group', { name: '确认删除批注：关键原文' });
    await user.click(within(confirmGroup).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('group', { name: '确认删除批注：关键原文' })).not.toBeInTheDocument();
    expect(deleteAnnotation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '删除批注：关键原文' }));
    await user.click(
      within(screen.getByRole('group', { name: '确认删除批注：关键原文' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(deleteAnnotation).toHaveBeenCalledWith('a1', 'chapter-1');
  });

  it('announces edit failures and keeps the editor open', async () => {
    const user = userEvent.setup();
    const updateAnnotation = vi.fn(async () => {
      throw new Error('IndexedDB 写入失败');
    });
    useAnnotationStore.setState({ update: updateAnnotation });
    render(<AnnotationPanel open onClose={vi.fn()} />);

    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    await user.type(screen.getByRole('textbox', { name: '批注笔记' }), '补充想法');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '批注保存失败：IndexedDB 写入失败',
    );
    expect(screen.getByRole('textbox', { name: '批注笔记' })).toHaveValue('补充想法');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('announces delete failures and keeps confirmation available', async () => {
    const user = userEvent.setup();
    const deleteAnnotation = vi.fn(async () => {
      throw new Error('IndexedDB 删除失败');
    });
    useAnnotationStore.setState({ delete: deleteAnnotation });
    render(<AnnotationPanel open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '删除批注：关键原文' }));
    const confirmGroup = screen.getByRole('group', { name: '确认删除批注：关键原文' });
    await user.click(within(confirmGroup).getByRole('button', { name: '删除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '批注删除失败：IndexedDB 删除失败',
    );
    expect(screen.getByRole('group', { name: '确认删除批注：关键原文' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: '确认删除批注：关键原文' })).getByRole('button', {
        name: '删除',
      }),
    ).toBeEnabled();
  });
});
