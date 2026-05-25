import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionActions } from '@/hooks/useSelectionActions';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import type { ChatChunk } from '@/types/api';
import type { Book, Chapter } from '@/types/domain';

const ai = vi.hoisted(() => ({
  translate: vi.fn(),
  explain: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@/lib/ai-service-client', () => ({
  getAIService: () => ai,
}));

const book: Book = {
  id: 'book-1',
  title: 'Hook 测试书',
  fileName: 'book.pdf',
  totalPages: 3,
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
  endPage: 3,
  content: 'alpha beta gamma',
  wordCount: 3,
};

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

function Harness() {
  const { result, runInline, cancelInline } = useSelectionActions();

  return (
    <div>
      <button type="button" onClick={() => { void runInline('translate'); }}>
        翻译
      </button>
      <button
        type="button"
        onClick={() => {
          void runInline('summarize' as unknown as Parameters<typeof runInline>[0]);
        }}
      >
        非法任务
      </button>
      <button type="button" onClick={cancelInline}>
        停止
      </button>
      <output aria-label="状态">
        {result ? `${result.streaming ? 'streaming' : 'idle'}:${result.error ?? result.text}` : 'empty'}
      </output>
    </div>
  );
}

describe('useSelectionActions', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    vi.clearAllMocks();
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
    useReaderStore.getState().setSelection({ text: 'beta', start: 6, end: 10, page: 2 });
  });

  it('keeps cancellation feedback when late inline chunks arrive', async () => {
    const user = userEvent.setup();
    const stream = createControlledChunks();
    const cancel = vi.fn();
    ai.translate.mockReturnValue({
      chunks: stream.chunks(),
      done: new Promise(() => undefined),
      cancel,
    });

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '翻译' }));
    expect(screen.getByLabelText('状态')).toHaveTextContent('streaming:');

    await user.click(screen.getByRole('button', { name: '停止' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('状态')).toHaveTextContent('idle:已停止生成');

    stream.push({ type: 'text', text: 'late text' });
    stream.close();

    await waitFor(() => {
      expect(screen.getByLabelText('状态')).toHaveTextContent('idle:已停止生成');
    });
  });

  it('ignores malformed inline task types instead of falling through to verify', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '非法任务' }));

    expect(ai.translate).not.toHaveBeenCalled();
    expect(ai.explain).not.toHaveBeenCalled();
    expect(ai.verify).not.toHaveBeenCalled();
    expect(screen.getByLabelText('状态')).toHaveTextContent('empty');
  });
});
