import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@/stores/configStore';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { ReadingStatsPanel } from './ReadingStatsPanel';
import type { Book, Chapter } from '@/types/domain';

vi.mock('@/adapters/storage/IndexedDBReadingProgressRepo', () => ({
  IndexedDBReadingProgressRepo: vi.fn(function IndexedDBReadingProgressRepo() {
    return {
      get: vi.fn().mockResolvedValue(null),
    };
  }),
}));

vi.mock('@/adapters/storage/IndexedDBAnnotationRepo', () => ({
  IndexedDBAnnotationRepo: vi.fn(function IndexedDBAnnotationRepo() {
    return {
      listByBook: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/adapters/storage/IndexedDBTimelineRepo', () => ({
  IndexedDBTimelineRepo: vi.fn(function IndexedDBTimelineRepo() {
    return {
      listByBook: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@/adapters/storage/IndexedDBReadingSessionRepo', () => ({
  IndexedDBReadingSessionRepo: vi.fn(function IndexedDBReadingSessionRepo() {
    return {
      listByBook: vi.fn().mockResolvedValue([]),
    };
  }),
}));

const initialConfigState = useConfigStore.getState();

const book: Book = {
  id: 'book-1',
  title: '阅读统计测试书',
  fileName: 'book.pdf',
  totalPages: 12,
  totalChapters: 1,
  uploadedAt: new Date('2026-05-24T00:00:00.000Z'),
  language: 'zh',
};

const chapter: Chapter = {
  id: 'chapter-1',
  bookId: 'book-1',
  orderIndex: 1,
  title: '开篇',
  startPage: 1,
  endPage: 12,
  content: 'chapter content',
  wordCount: 2,
};

describe('ReadingStatsPanel', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
    useConfigStore.setState({
      ...initialConfigState,
      dailyReadingGoalMinutes: 30,
      setDailyReadingGoalMinutes: vi.fn(async (dailyReadingGoalMinutes: number) => {
        useConfigStore.setState({ dailyReadingGoalMinutes });
      }),
    });
  });

  it('does not save zero when a cleared goal input loses focus', async () => {
    const user = userEvent.setup();
    render(<ReadingStatsPanel open onClose={vi.fn()} />);

    const input = await screen.findByRole('spinbutton', { name: '今日阅读目标分钟数' });
    await user.clear(input);
    await user.tab();

    expect(useConfigStore.getState().setDailyReadingGoalMinutes).not.toHaveBeenCalled();
    expect(input).toHaveValue(30);
  });

  it('does not save zero when pressing Enter on a cleared goal input', async () => {
    const user = userEvent.setup();
    render(<ReadingStatsPanel open onClose={vi.fn()} />);

    const input = await screen.findByRole('spinbutton', { name: '今日阅读目标分钟数' });
    await user.clear(input);
    await user.keyboard('{Enter}');

    expect(useConfigStore.getState().setDailyReadingGoalMinutes).not.toHaveBeenCalled();
    expect(input).toHaveValue(30);
  });

  it('shows visible feedback when goal saving fails', async () => {
    const user = userEvent.setup();
    const setDailyReadingGoalMinutes = vi.fn(async () => {
      throw new Error('IndexedDB 写入失败');
    });
    useConfigStore.setState({ setDailyReadingGoalMinutes });
    render(<ReadingStatsPanel open onClose={vi.fn()} />);

    const input = await screen.findByRole('spinbutton', { name: '今日阅读目标分钟数' });
    await user.clear(input);
    await user.type(input, '45');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(setDailyReadingGoalMinutes).toHaveBeenCalledWith(45);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '目标保存失败：IndexedDB 写入失败',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows visible feedback without saving non-finite goal input', async () => {
    const user = userEvent.setup();
    render(<ReadingStatsPanel open onClose={vi.fn()} />);

    const input = await screen.findByRole('spinbutton', { name: '今日阅读目标分钟数' });
    await user.clear(input);
    await user.type(input, '1e9999');
    await user.keyboard('{Enter}');

    expect(useConfigStore.getState().setDailyReadingGoalMinutes).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('目标保存失败：请输入有效的分钟数');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not save negative goal input as zero', async () => {
    const user = userEvent.setup();
    render(<ReadingStatsPanel open onClose={vi.fn()} />);

    const input = await screen.findByRole('spinbutton', { name: '今日阅读目标分钟数' });
    await user.clear(input);
    await user.type(input, '-5');
    await user.keyboard('{Enter}');

    expect(useConfigStore.getState().setDailyReadingGoalMinutes).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('目标保存失败：请输入不小于 0 的分钟数');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
