import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChapterNav } from './ChapterNav';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import type { Chapter } from '@/types/domain';

const chapter = (id: string, orderIndex: number, title: string): Chapter => ({
  id,
  bookId: 'book-1',
  orderIndex,
  title,
  startPage: orderIndex,
  endPage: orderIndex,
  content: `${title} content`,
  wordCount: 2,
});

describe('ChapterNav', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    useReaderStore.getState().setChapters([
      chapter('chapter-1', 1, '开篇'),
      chapter('chapter-2', 2, '方法'),
      chapter('chapter-3', 3, '结论'),
    ]);
  });

  it('moves focus between chapter items with arrow keys', async () => {
    const user = userEvent.setup();
    render(<ChapterNav />);

    const firstChapter = screen.getByRole('button', { name: /开篇/ });
    const secondChapter = screen.getByRole('button', { name: /方法/ });
    const thirdChapter = screen.getByRole('button', { name: /结论/ });

    firstChapter.focus();
    await user.keyboard('{ArrowDown}');

    expect(secondChapter).toHaveFocus();

    await user.keyboard('{ArrowUp}');

    expect(firstChapter).toHaveFocus();

    await user.keyboard('{ArrowUp}');

    expect(thirdChapter).toHaveFocus();
  });

  it('selects the focused chapter with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ChapterNav />);

    const firstChapter = screen.getByRole('button', { name: /开篇/ });
    const secondChapter = screen.getByRole('button', { name: /方法/ });
    const thirdChapter = screen.getByRole('button', { name: /结论/ });

    secondChapter.focus();
    await user.keyboard('{Enter}');

    expect(useReaderStore.getState().currentChapterId).toBe('chapter-2');
    expect(secondChapter).toHaveAttribute('aria-current', 'page');
    expect(firstChapter).not.toHaveAttribute('aria-current');

    thirdChapter.focus();
    await user.keyboard(' ');

    expect(useReaderStore.getState().currentChapterId).toBe('chapter-3');
    expect(thirdChapter).toHaveAttribute('aria-current', 'page');
  });

  it('disables previous and next controls at chapter boundaries', async () => {
    const user = userEvent.setup();
    render(<ChapterNav />);

    const previousButton = screen.getByRole('button', { name: '上一章' });
    const nextButton = screen.getByRole('button', { name: '下一章' });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    expect(useReaderStore.getState().currentChapterId).toBe('chapter-2');
    expect(previousButton).toBeEnabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    expect(useReaderStore.getState().currentChapterId).toBe('chapter-3');
    expect(previousButton).toBeEnabled();
    expect(nextButton).toBeDisabled();
  });

  it('keeps boundary controls disabled when the current chapter is missing', () => {
    useReaderStore.setState({ currentChapterId: 'missing-chapter' });

    render(<ChapterNav />);

    expect(screen.getByRole('button', { name: '上一章' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一章' })).toBeDisabled();
    expect(screen.queryByRole('button', { current: 'page' })).not.toBeInTheDocument();
  });

  it('shows an empty state when no chapters are available', () => {
    useReaderStore.getState().setChapters([]);

    render(<ChapterNav />);

    expect(screen.getByRole('button', { name: '上一章' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一章' })).toBeDisabled();
    expect(screen.getByText('暂无可用章节')).toBeInTheDocument();
  });
});
