import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { AISidebar } from './AISidebar';
import type { Book, Chapter } from '@/types/domain';

const ai = vi.hoisted(() => ({
  chat: vi.fn(),
}));

const timelineRepo = vi.hoisted(() => ({
  listByBook: vi.fn(),
}));

vi.mock('@/lib/ai-service-client', () => ({
  getAIService: () => ({
    chat: ai.chat,
  }),
}));

vi.mock('@/adapters/storage/IndexedDBTimelineRepo', () => ({
  IndexedDBTimelineRepo: vi.fn(() => ({
    listByBook: timelineRepo.listByBook,
  })),
}));

vi.mock('@/components/shared/ModelSwitcher', () => ({
  ModelSwitcher: () => <div data-testid="model-switcher" />,
}));

const book: Book = {
  id: 'book-1',
  title: '对话测试书',
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
  endPage: 10,
  content: '用于测试 AI 对话侧栏的章节内容。',
  wordCount: 16,
};

type TestChatChunk =
  | { type: 'text'; text: string }
  | { type: 'error'; error: string; retryable?: boolean };

function chatResult(chunks: TestChatChunk[]) {
  return {
    cancel: vi.fn(),
    done: Promise.resolve({}),
    chunks: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
  };
}

function deferredChatResult() {
  let release: (chunk: TestChatChunk) => void = () => undefined;
  const nextChunk = new Promise<TestChatChunk>(resolve => {
    release = resolve;
  });
  const cancel = vi.fn();

  return {
    cancel,
    release,
    result: {
      cancel,
      done: Promise.resolve({}),
      chunks: (async function* () {
        yield await nextChunk;
      })(),
    },
  };
}

describe('AISidebar', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    ai.chat.mockReset();
    timelineRepo.listByBook.mockReset();
    timelineRepo.listByBook.mockResolvedValue([]);
    useReaderStore.getState().setBook(book);
    useReaderStore.getState().setChapters([chapter]);
    useReaderStore.getState().setSidebarOpen(true);
  });

  it('does not send empty or whitespace-only chat input', async () => {
    const user = userEvent.setup();
    render(<AISidebar />);

    const input = screen.getByPlaceholderText('追问…');
    const sendButton = screen.getByRole('button', { name: '发送' });

    expect(sendButton).toBeDisabled();

    await user.click(input);
    await user.keyboard('{Enter}');
    expect(ai.chat).not.toHaveBeenCalled();

    await user.type(input, '   ');
    expect(sendButton).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('announces chat history restore failures and returns to an editable state', async () => {
    timelineRepo.listByBook.mockRejectedValue(new Error('IndexedDB 读取失败'));
    useReaderStore.getState().setThreadAnchor({
      threadId: 'thread-1',
      originalText: '需要继续追问的原文',
      type: 'chat',
    });

    render(<AISidebar />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '对话恢复失败：IndexedDB 读取失败',
    );
    expect(screen.getByPlaceholderText('追问…')).not.toBeDisabled();
    expect(screen.queryByText('正在恢复对话…')).not.toBeInTheDocument();
    expect(screen.queryByText('基于上面的原文继续追问')).not.toBeInTheDocument();
  });

  it('announces streaming chat errors and keeps retry available', async () => {
    const user = userEvent.setup();
    ai.chat
      .mockReturnValueOnce(
        chatResult([{ type: 'error', error: '模型请求超时', retryable: true }]),
      )
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '重试成功' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '为什么这样理解？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('模型请求超时');
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(ai.chat).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('重试成功')).toBeInTheDocument();
  });

  it('excludes failed exchanges from the next chat request history', async () => {
    const user = userEvent.setup();
    ai.chat
      .mockReturnValueOnce(
        chatResult([{ type: 'error', error: '模型请求超时', retryable: true }]),
      )
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '新的回答' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '失败的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('模型请求超时');

    await user.type(screen.getByPlaceholderText('追问…'), '新的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(ai.chat).toHaveBeenCalledTimes(2);
    expect(ai.chat.mock.calls[1][0].history).toEqual([
      { role: 'user', content: '新的问题' },
    ]);
    expect(await screen.findByText('新的回答')).toBeInTheDocument();
  });

  it('excludes transport failures from the next chat request history', async () => {
    const user = userEvent.setup();
    ai.chat
      .mockImplementationOnce(() => {
        throw new Error('网络连接失败');
      })
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '恢复后的回答' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '会触发网络失败的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败');

    await user.type(screen.getByPlaceholderText('追问…'), '恢复后的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(ai.chat).toHaveBeenCalledTimes(2);
    expect(ai.chat.mock.calls[1][0].history).toEqual([
      { role: 'user', content: '恢复后的问题' },
    ]);
    expect(await screen.findByText('恢复后的回答')).toBeInTheDocument();
  });

  it('treats empty successful responses as retryable failures outside later history', async () => {
    const user = userEvent.setup();
    ai.chat
      .mockReturnValueOnce(chatResult([]))
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '空回复后的回答' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '会得到空回复的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('AI 没有返回内容。请重试。');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('追问…'), '空回复后的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(ai.chat).toHaveBeenCalledTimes(2);
    expect(ai.chat.mock.calls[1][0].history).toEqual([
      { role: 'user', content: '空回复后的问题' },
    ]);
    expect(await screen.findByText('空回复后的回答')).toBeInTheDocument();
  });

  it('retries failed turns with only the completed prior context', async () => {
    const user = userEvent.setup();
    ai.chat
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '第一轮回答' }]))
      .mockReturnValueOnce(
        chatResult([{ type: 'error', error: '第二轮失败', retryable: true }]),
      )
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '第二轮重试成功' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '第一轮问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('第一轮回答')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('追问…'), '第二轮问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('第二轮失败');

    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(ai.chat).toHaveBeenCalledTimes(3);
    expect(ai.chat.mock.calls[2][0].history).toEqual([
      { role: 'user', content: '第一轮问题' },
      { role: 'assistant', content: '第一轮回答' },
      { role: 'user', content: '第二轮问题' },
    ]);
    expect(await screen.findByText('第二轮重试成功')).toBeInTheDocument();
  });

  it('cancels streaming output without carrying the stopped exchange into later history', async () => {
    const user = userEvent.setup();
    const pending = deferredChatResult();
    ai.chat
      .mockReturnValueOnce(pending.result)
      .mockReturnValueOnce(chatResult([{ type: 'text', text: '取消后回答' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '要取消的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await user.click(await screen.findByRole('button', { name: '停止生成' }));

    expect(pending.cancel).toHaveBeenCalledTimes(1);
    pending.release({ type: 'text', text: '不应显示的回答' });
    expect(await screen.findByRole('alert')).toHaveTextContent('[已停止生成]');

    await user.type(screen.getByPlaceholderText('追问…'), '取消后的问题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(ai.chat).toHaveBeenCalledTimes(2));
    expect(ai.chat.mock.calls[1][0].history).toEqual([
      { role: 'user', content: '取消后的问题' },
    ]);
    expect(await screen.findByText('取消后回答')).toBeInTheDocument();
  });

  it('starts a new conversation from header action and clears current turns', async () => {
    const user = userEvent.setup();
    ai.chat.mockReturnValueOnce(chatResult([{ type: 'text', text: '已有会话回答' }]));
    render(<AISidebar />);

    await user.type(screen.getByPlaceholderText('追问…'), '已有会话问题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('已有会话回答')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新开会话' }));

    expect(screen.getByText('问我任何关于这本书的问题')).toBeInTheDocument();
    expect(screen.queryByText('已有会话回答')).not.toBeInTheDocument();
  });
});
