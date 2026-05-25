import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { ChapterContent } from './ChapterContent';
import type { Book, Chapter } from '@/types/domain';

vi.mock('@/stores/annotationStore', () => ({
  useAnnotationStore: (selector: (state: {
    byChapter: Record<string, unknown[]>;
    loadChapter: () => Promise<void>;
  }) => unknown) =>
    selector({
      byChapter: {},
      loadChapter: vi.fn(async () => undefined),
    }),
}));

const book: Book = {
  id: 'book-1',
  title: '右键测试书',
  fileName: 'book.pdf',
  totalPages: 10,
  totalChapters: 1,
  uploadedAt: new Date('2026-05-24T00:00:00.000Z'),
  language: 'zh',
};

const chapter: Chapter = {
  id: 'chapter-1',
  bookId: 'book-1',
  orderIndex: 1,
  title: '第一章',
  startPage: 1,
  endPage: 10,
  content: 'alpha beta gamma',
  wordCount: 3,
};

describe('ChapterContent', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
  });

  it('stores the current DOM selection before opening the context menu', () => {
    const onContextMenu = vi.fn();
    render(<ChapterContent onContextMenu={onContextMenu} />);

    const textNode = screen.getByText('alpha beta gamma').firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 10);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    screen.getByText('alpha beta gamma').dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );

    expect(onContextMenu).toHaveBeenCalledWith(120, 80);
    expect(useReaderStore.getState().selection).toEqual({
      text: 'beta',
      start: 6,
      end: 10,
    });
  });

  it('does not clear the current selection on right-button mouseup before contextmenu', () => {
    useReaderStore.getState().setSelection({
      text: 'beta',
      start: 6,
      end: 10,
    });
    render(<ChapterContent />);

    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
    } as unknown as Selection);

    fireEvent.mouseUp(screen.getByText('alpha beta gamma'), { button: 2 });

    expect(useReaderStore.getState().selection).toEqual({
      text: 'beta',
      start: 6,
      end: 10,
    });
  });

  it('opens the context menu from the existing selection when DOM selection is unavailable', () => {
    const onContextMenu = vi.fn();
    useReaderStore.getState().setSelection({
      text: 'beta',
      start: 6,
      end: 10,
    });
    render(<ChapterContent onContextMenu={onContextMenu} />);

    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
    } as unknown as Selection);

    fireEvent.contextMenu(screen.getByText('alpha beta gamma'), {
      clientX: 120,
      clientY: 80,
    });

    expect(onContextMenu).toHaveBeenCalledWith(120, 80);
    expect(useReaderStore.getState().selection).toEqual({
      text: 'beta',
      start: 6,
      end: 10,
    });
  });
});
