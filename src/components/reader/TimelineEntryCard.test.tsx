import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { TimelineEntryCard } from './TimelineEntryCard';
import type { Chapter, TimelineEntry } from '@/types/domain';

const chapter: Chapter = {
  id: 'chapter-1',
  bookId: 'book-1',
  orderIndex: 1,
  title: '第一章',
  startPage: 1,
  endPage: 10,
  content: '这是一段需要回跳定位的原文。',
  wordCount: 1,
};

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'entry-1',
    bookId: 'book-1',
    chapterId: 'chapter-1',
    timestamp: new Date('2026-05-24T08:00:00.000Z'),
    type: 'explain',
    originalText: '这是一段需要回跳定位的原文。',
    anchor: {
      start: 12,
      end: 25,
      quote: '这是一段需要回跳定位的原文。',
      page: 7,
    },
    userInput: '这里是什么意思？',
    aiModel: 'gpt-test',
    aiResponse: '这段文字是在解释核心论点。',
    costTokens: { input: 12, output: 18 },
    costAmount: 0.0012,
    persona: 'general',
    ...overrides,
  };
}

describe('TimelineEntryCard', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
  });

  it('labels the original snippet jump button with readable source metadata', () => {
    render(<TimelineEntryCard entry={entry()} />);

    const sourceButton = screen.getByRole('button', {
      name: '跳回原文，第 7 页，位置 12-25',
    });

    expect(sourceButton).toHaveAttribute('title', '跳回原文，第 7 页，位置 12-25');
    expect(sourceButton).toHaveTextContent('这是一段需要回跳定位的原文。');
  });

  it('jumps back to the original anchor when the snippet is clicked', async () => {
    const user = userEvent.setup();
    useReaderStore.getState().setChapters([chapter]);
    render(<TimelineEntryCard entry={entry()} />);

    await user.click(screen.getByRole('button', { name: '跳回原文，第 7 页，位置 12-25' }));

    expect(useReaderStore.getState().pendingAnchor).toEqual({
      chapterId: 'chapter-1',
      text: '这是一段需要回跳定位的原文。',
      start: 12,
      end: 25,
      page: 7,
    });
  });

  it('labels the continue button and opens the sidebar for the thread', async () => {
    const user = userEvent.setup();
    render(<TimelineEntryCard entry={entry({ threadId: 'thread-1' })} />);

    await user.click(screen.getByRole('button', { name: '继续这段原文的对话' }));

    expect(useReaderStore.getState().sidebarOpen).toBe(true);
    expect(useReaderStore.getState().threadAnchor).toEqual({
      threadId: 'thread-1',
      originalText: '这是一段需要回跳定位的原文。',
      type: 'chat',
    });
  });

  it('keeps imported invalid time, anchor metadata, and cost values bounded in the UI', () => {
    render(
      <TimelineEntryCard
        entry={entry({
          timestamp: new Date(Number.NaN),
          page: -2,
          anchor: {
            start: 30,
            end: 12,
            quote: '这是一段需要回跳定位的原文。',
            page: Number.NaN,
          },
          costTokens: { input: -10, output: Number.POSITIVE_INFINITY },
          costAmount: Number.NaN,
        })}
      />,
    );

    expect(screen.getByText('时间未知')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '跳回原文片段' })).toBeInTheDocument();
    expect(screen.getByText('gpt-test · 0 tokens · $0.0000')).toBeInTheDocument();
  });

  it('falls back for imported blank answers, blank questions, and unknown task types', () => {
    render(
      <TimelineEntryCard
        entry={entry({
          type: 'legacy-task' as TimelineEntry['type'],
          userInput: '   ',
          aiResponse: '\n\t',
        })}
      />,
    );

    expect(screen.getByText('未知')).toBeInTheDocument();
    expect(screen.queryByText('问：')).not.toBeInTheDocument();
    expect(screen.getByText('AI 回答为空')).toBeInTheDocument();
  });

  it('keeps safe verify source links clickable and falls empty titles back to the URL', () => {
    render(
      <TimelineEntryCard
        entry={entry({
          type: 'verify',
          sources: [
            { url: 'https://example.com/source', title: 'Source title', snippet: 'ok' },
            { url: 'http://example.com/plain', title: 'Plain HTTP source', snippet: 'ok' },
            { url: ' mailto:editor@example.com ', title: '   ', snippet: 'ok' },
          ],
        })}
      />,
    );

    expect(screen.getByRole('link', { name: '[1] Source title' })).toHaveAttribute(
      'href',
      'https://example.com/source',
    );
    expect(screen.getByRole('link', { name: '[2] Plain HTTP source' })).toHaveAttribute(
      'href',
      'http://example.com/plain',
    );
    expect(screen.getByRole('link', { name: '[3] mailto:editor@example.com' })).toHaveAttribute(
      'href',
      'mailto:editor@example.com',
    );
  });

  it('shows valid verify confidence and hides invalid imported confidence', () => {
    const { rerender } = render(
      <TimelineEntryCard
        entry={entry({
          type: 'verify',
          confidence: 'medium',
        })}
      />,
    );

    expect(screen.getByText('置信度：')).toBeInTheDocument();
    expect(screen.getByText('中')).toBeInTheDocument();

    rerender(
      <TimelineEntryCard
        entry={entry({
          type: 'verify',
          confidence: 'certain' as TimelineEntry['confidence'],
        })}
      />,
    );

    expect(screen.queryByText('置信度：')).not.toBeInTheDocument();
    expect(screen.queryByText('certain')).not.toBeInTheDocument();
  });

  it('downgrades unsafe or invalid verify source URLs to non-link text', () => {
    render(
      <TimelineEntryCard
        entry={entry({
          type: 'verify',
          sources: [
            { url: 'javascript:alert(1)', title: 'Unsafe script', snippet: 'bad' },
            { url: 'data:text/html,<h1>x</h1>', title: '', snippet: 'bad' },
            { url: 'not a url', title: 'Broken URL', snippet: 'bad' },
          ],
        })}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('[1] Unsafe script')).toBeInTheDocument();
    expect(screen.getByText('[2] 无效来源链接')).toBeInTheDocument();
    expect(screen.getByText('[3] Broken URL')).toBeInTheDocument();
  });
});
