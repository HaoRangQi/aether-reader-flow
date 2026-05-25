import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { TimelinePanel } from './TimelinePanel';
import type { Book, Chapter } from '@/types/domain';

const book: Book = {
  id: 'book-1',
  title: '测试书籍',
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
  title: '开篇',
  startPage: 1,
  endPage: 2,
  content: 'chapter content',
  wordCount: 2,
};

describe('TimelinePanel', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
    useTimelineStore.setState({
      entries: [],
      filter: {},
      query: '',
      panelOpen: true,
      reload: vi.fn().mockResolvedValue(undefined),
    });
  });

  async function waitForTimelineReload(): Promise<void> {
    await waitFor(() => {
      expect(screen.queryByText('正在加载时间轴…')).not.toBeInTheDocument();
    });
  }

  it('updates aria-pressed when toggling a type filter', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel />);
    await waitForTimelineReload();

    const filterGroup = screen.getByRole('group', { name: '按交互类型筛选时间轴' });
    const translateButton = screen.getByRole('button', { name: '筛选翻译条目' });

    expect(filterGroup).toContainElement(translateButton);
    expect(translateButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(translateButton);

    expect(screen.getByRole('button', { name: '取消筛选翻译条目' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('announces the empty state as a status region', async () => {
    render(<TimelinePanel />);
    await waitForTimelineReload();

    const status = screen.getByRole('status', { name: '时间轴空状态' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('开始划词，AI 会陪你读懂');
  });

  it('lets readers clear filters from an empty filtered result', async () => {
    const user = userEvent.setup();
    useTimelineStore.setState({
      filter: { types: ['translate'] },
      query: 'alchemy',
    });

    render(<TimelinePanel />);
    await waitForTimelineReload();

    expect(screen.getByRole('status', { name: '时间轴空状态' })).toHaveTextContent(
      '没有匹配的条目',
    );
    expect(screen.getByRole('button', { name: '取消筛选翻译条目' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '清除筛选' }));

    expect(screen.getByRole('textbox', { name: '搜索时间轴条目' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '筛选翻译条目' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status', { name: '时间轴空状态' })).toHaveTextContent(
      '开始划词，AI 会陪你读懂',
    );
  });

  it('announces timeline loading without hiding filters', async () => {
    useTimelineStore.setState({
      reload: vi.fn(() => new Promise<void>(() => undefined)),
    });

    render(<TimelinePanel />);

    expect(await screen.findByText('正在加载时间轴…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '时间轴空状态' })).toHaveTextContent(
      '正在加载时间轴…',
    );
    expect(screen.getByRole('textbox', { name: '搜索时间轴条目' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '按章节筛选时间轴' })).toBeInTheDocument();
  });

  it('reports reload failures while keeping the panel usable', async () => {
    useTimelineStore.setState({
      reload: vi.fn().mockRejectedValue(new Error('IndexedDB offline')),
    });

    render(<TimelinePanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '时间轴加载失败：IndexedDB offline',
    );
    expect(screen.getByRole('button', { name: '关闭时间轴面板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '筛选翻译条目' })).toBeInTheDocument();
  });
});
