import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetAnnotationStoreForTests, useAnnotationStore } from '@/stores/annotationStore';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { ChapterSummaryPanel } from './ChapterSummaryPanel';
import type { Book, Chapter, ChapterSummary } from '@/types/domain';
import type { ChatChunk } from '@/types/api';

const ai = vi.hoisted(() => ({
  summarize: vi.fn(),
}));
const chapterRepo = vi.hoisted(() => ({
  update: vi.fn(),
}));
const timelineRepo = vi.hoisted(() => ({
  listByChapter: vi.fn(),
}));

vi.mock('@/lib/ai-service-client', () => ({
  getAIService: () => ({
    summarize: ai.summarize,
  }),
}));

vi.mock('@/adapters/storage/IndexedDBTimelineRepo', () => ({
  IndexedDBTimelineRepo: vi.fn(function IndexedDBTimelineRepo() {
    return {
      listByChapter: timelineRepo.listByChapter,
    };
  }),
}));

vi.mock('@/adapters/storage/IndexedDBChapterRepo', () => ({
  IndexedDBChapterRepo: vi.fn(function IndexedDBChapterRepo() {
    return {
      update: chapterRepo.update,
    };
  }),
}));

const book: Book = {
  id: 'book-1',
  title: '总结测试书',
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
  content: '这是一章用于测试总结面板的内容。',
  wordCount: 15,
};

async function* pendingChunks(): AsyncGenerator<ChatChunk, void, void> {
  await new Promise<never>(() => undefined);
}

async function* errorChunks(): AsyncGenerator<ChatChunk, void, void> {
  yield { type: 'error', error: '模型暂时不可用', retryable: true };
}

async function* summaryChunks(): AsyncGenerator<ChatChunk, void, void> {
  yield { type: 'text', text: '## 核心论点\n- 观点一\n' };
  yield { type: 'text', text: '## 论证逻辑\n先提出问题，再给出答案。\n' };
}

function rejectedDone(): Promise<never> {
  const done = Promise.reject(new Error('stream failed'));
  void done.catch(() => undefined);
  return done;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createControlledChunks() {
  const queue: ChatChunk[] = [];
  const waiters: Array<(value: IteratorResult<ChatChunk, void>) => void> = [];
  let closed = false;

  return {
    async *chunks(): AsyncGenerator<ChatChunk, void, void> {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (closed) return;
        const next = await new Promise<IteratorResult<ChatChunk, void>>(resolve => {
          waiters.push(resolve);
        });
        if (next.done) return;
        yield next.value;
      }
    },
    push(chunk: ChatChunk) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value: chunk, done: false });
        return;
      }
      queue.push(chunk);
    },
    close() {
      closed = true;
      const waiter = waiters.shift();
      if (waiter) waiter({ value: undefined, done: true });
    },
  };
}

describe('ChapterSummaryPanel', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    _resetAnnotationStoreForTests();
    ai.summarize.mockReset();
    chapterRepo.update.mockReset();
    chapterRepo.update.mockResolvedValue(undefined);
    timelineRepo.listByChapter.mockReset();
    timelineRepo.listByChapter.mockResolvedValue([]);
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
    useReaderStore.getState().setSummaryOpen(true);
    useAnnotationStore.setState({
      loadChapter: vi.fn(async () => undefined),
    });
  });

  it('announces chapter summary generation as a polite status region', async () => {
    const user = userEvent.setup();
    ai.summarize.mockReturnValue({
      chunks: pendingChunks(),
      done: new Promise(() => undefined),
      cancel: vi.fn(),
    });

    render(<ChapterSummaryPanel />);

    await user.click(screen.getByRole('button', { name: '生成本章总结' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('正在生成…');
  });

  it('announces retryable summary errors and keeps the retry action available', async () => {
    const user = userEvent.setup();
    ai.summarize.mockReturnValue({
      chunks: errorChunks(),
      done: rejectedDone(),
      cancel: vi.fn(),
    });

    render(<ChapterSummaryPanel />);

    await user.click(screen.getByRole('button', { name: '生成本章总结' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('模型暂时不可用');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('ignores late chunks and done after cancellation', async () => {
    const user = userEvent.setup();
    const stream = createControlledChunks();
    const done = createDeferred<{
      timestamp: Date;
      aiModel: string;
    }>();
    const cancel = vi.fn();
    ai.summarize.mockReturnValue({
      chunks: stream.chunks(),
      done: done.promise,
      cancel,
    });

    render(<ChapterSummaryPanel />);

    await user.click(screen.getByRole('button', { name: '生成本章总结' }));
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: '停止生成' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('已停止生成');

    stream.push({ type: 'text', text: '## 核心论点\n- 不应写入\n' });
    stream.close();
    done.resolve({
      timestamp: new Date('2026-05-24T08:00:00.000Z'),
      aiModel: 'late-model',
    });

    await Promise.resolve();
    expect(chapterRepo.update).not.toHaveBeenCalled();
    expect(useReaderStore.getState().chapters[0]?.summaryCache).toBeUndefined();
    expect(screen.queryByText('不应写入')).not.toBeInTheDocument();
  });

  it('keeps generated summary visible and reports cache persistence failures', async () => {
    const user = userEvent.setup();
    chapterRepo.update.mockRejectedValue(new Error('IndexedDB 写入失败'));
    ai.summarize.mockReturnValue({
      chunks: summaryChunks(),
      done: Promise.resolve({
        timestamp: new Date('2026-05-24T08:00:00.000Z'),
        aiModel: 'test-model',
      }),
      cancel: vi.fn(),
    });

    render(<ChapterSummaryPanel />);

    await user.click(screen.getByRole('button', { name: '生成本章总结' }));

    expect(await screen.findByText('观点一')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '总结已生成，但缓存保存失败：IndexedDB 写入失败',
    );
    expect(useReaderStore.getState().chapters[0]?.summaryCache).toBeUndefined();
    expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument();
  });

  it('reports timeline loading failures without hiding summary or annotations area', async () => {
    const cachedSummary: ChapterSummary = {
      corePoints: ['缓存观点'],
      keyConcepts: [],
      argumentFlow: '',
      openQuestions: [],
      generatedAt: new Date('2026-05-24T08:00:00.000Z'),
      modelUsed: 'cached-model',
    };
    timelineRepo.listByChapter.mockRejectedValue(new Error('timeline offline'));
    useReaderStore.getState().setChapters([{ ...chapter, summaryCache: cachedSummary }]);
    useAnnotationStore.setState({
      byChapter: {
        [chapter.id]: [
          {
            id: 'ann-1',
            bookId: book.id,
            chapterId: chapter.id,
            type: 'highlight',
            anchor: { quote: '批注内容', start: 0, end: 4 },
            color: 'important',
            createdAt: new Date('2026-05-24T08:00:00.000Z'),
            updatedAt: new Date('2026-05-24T08:00:00.000Z'),
          },
        ],
      },
      loadChapter: vi.fn(async () => undefined),
    });

    render(<ChapterSummaryPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI 活动加载失败：timeline offline',
    );
    expect(screen.getByText('缓存观点')).toBeInTheDocument();
    expect(screen.getByText('批注内容')).toBeInTheDocument();
  });

  it('does not start duplicate summary requests while generation is busy', async () => {
    const user = userEvent.setup();
    ai.summarize.mockReturnValue({
      chunks: pendingChunks(),
      done: new Promise(() => undefined),
      cancel: vi.fn(),
    });

    render(<ChapterSummaryPanel />);

    const generateButton = screen.getByRole('button', { name: '生成本章总结' });
    await Promise.all([user.click(generateButton), user.click(generateButton)]);

    expect(ai.summarize).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('正在生成…');
  });
});
