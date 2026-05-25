import { beforeEach, describe, expect, it } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from './readerStore';
import type { AIThreadAnchor } from './readerStore';
import type { Chapter } from '@/types/domain';

const chapter = (id: string, orderIndex: number): Chapter => ({
  id,
  bookId: 'b1',
  orderIndex,
  title: `Chapter ${orderIndex}`,
  startPage: 1,
  endPage: 1,
  content: 'alpha beta',
  wordCount: 2,
});

const runtimeThreadAnchor = (anchor: unknown): AIThreadAnchor => anchor as AIThreadAnchor;

describe('readerStore', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
  });

  it('sets the first chapter when chapters load', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);

    expect(useReaderStore.getState().currentChapterId).toBe('c1');
    expect(useReaderStore.getState().currentChapter()?.id).toBe('c1');
  });

  it('restores the preferred chapter when it exists', () => {
    useReaderStore.getState().setChapters(
      [chapter('c1', 1), chapter('c2', 2)],
      'c2',
    );

    expect(useReaderStore.getState().currentChapterId).toBe('c2');
    expect(useReaderStore.getState().currentChapter()?.id).toBe('c2');
  });

  it('falls back to the first chapter when preferred chapter is missing', () => {
    useReaderStore.getState().setChapters(
      [chapter('c1', 1), chapter('c2', 2)],
      'missing',
    );

    expect(useReaderStore.getState().currentChapterId).toBe('c1');
  });

  it('keeps selection and pending anchor when selecting the current chapter again', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);
    useReaderStore.getState().jumpToAnchor({
      chapterId: 'c1',
      text: 'alpha',
      start: 0,
      end: 5,
    });

    useReaderStore.getState().setChapter('c1');

    expect(useReaderStore.getState().currentChapterId).toBe('c1');
    expect(useReaderStore.getState().selection).toEqual({
      text: 'alpha',
      start: 0,
      end: 5,
      page: undefined,
    });
    expect(useReaderStore.getState().pendingAnchor).toEqual({
      chapterId: 'c1',
      text: 'alpha',
      start: 0,
      end: 5,
    });
  });

  it('ignores missing chapter ids without clearing the current reading state', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);
    useReaderStore.getState().setSelection({ text: 'alpha', start: 0, end: 5 });

    useReaderStore.getState().setChapter('missing');
    useReaderStore.getState().jumpToAnchor({ chapterId: 'missing', text: 'ghost' });

    expect(useReaderStore.getState().currentChapterId).toBe('c1');
    expect(useReaderStore.getState().selection).toEqual({
      text: 'alpha',
      start: 0,
      end: 5,
    });
    expect(useReaderStore.getState().pendingAnchor).toBeNull();
  });

  it('clears stale selection and pending anchor when chapters are reloaded', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);
    useReaderStore.getState().jumpToAnchor({
      chapterId: 'c2',
      text: 'beta',
      start: 6,
      end: 10,
    });

    useReaderStore.getState().setChapters([chapter('c3', 1)]);

    expect(useReaderStore.getState().currentChapterId).toBe('c3');
    expect(useReaderStore.getState().selection).toBeNull();
    expect(useReaderStore.getState().pendingAnchor).toBeNull();
  });

  it('jumpToAnchor switches chapter and exposes a pending scroll anchor', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);

    useReaderStore.getState().jumpToAnchor({
      chapterId: 'c2',
      text: 'beta',
      start: 6,
      end: 10,
      page: 3,
    });

    const state = useReaderStore.getState();
    expect(state.currentChapterId).toBe('c2');
    expect(state.pendingAnchor).toEqual({
      chapterId: 'c2',
      text: 'beta',
      start: 6,
      end: 10,
      page: 3,
    });
    expect(state.selection).toEqual({ text: 'beta', start: 6, end: 10, page: 3 });
  });

  it('jumpToAnchor without offsets still switches chapter without creating a selection', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);

    useReaderStore.getState().jumpToAnchor({ chapterId: 'c2', text: 'beta' });

    expect(useReaderStore.getState().currentChapterId).toBe('c2');
    expect(useReaderStore.getState().selection).toBeNull();
  });

  it('normalizes runtime selection offsets and page values', () => {
    useReaderStore.getState().setSelection({
      text: 'beta',
      start: 10.9,
      end: 6.2,
      page: Number.NaN,
    });

    expect(useReaderStore.getState().selection).toEqual({
      text: 'beta',
      start: 6,
      end: 10,
      page: undefined,
    });

    useReaderStore.getState().setSelection({
      text: 'bad',
      start: Number.POSITIVE_INFINITY,
      end: 10,
    });

    expect(useReaderStore.getState().selection).toBeNull();
  });

  it('normalizes jump anchors before exposing selection state', () => {
    useReaderStore.getState().setChapters([chapter('c1', 1), chapter('c2', 2)]);

    useReaderStore.getState().jumpToAnchor({
      chapterId: 'c2',
      text: 'beta',
      start: 10.8,
      end: 6.1,
      page: 3.9,
    });

    expect(useReaderStore.getState().pendingAnchor).toEqual({
      chapterId: 'c2',
      text: 'beta',
      start: 6,
      end: 10,
      page: 3,
    });
    expect(useReaderStore.getState().selection).toEqual({
      text: 'beta',
      start: 6,
      end: 10,
      page: 3,
    });
  });

  it('normalizes thread anchors before exposing sidebar restore state', () => {
    useReaderStore.getState().setThreadAnchor(runtimeThreadAnchor({
      threadId: '  thread-1  ',
      originalText: 42,
      type: 'explain',
    }));

    expect(useReaderStore.getState().threadAnchor).toEqual({
      threadId: 'thread-1',
      originalText: '',
      type: 'explain',
    });
  });

  it('drops malformed thread anchors from runtime state', () => {
    useReaderStore.getState().setThreadAnchor({
      threadId: 'thread-1',
      originalText: 'alpha',
      type: 'translate',
    });

    useReaderStore.getState().setThreadAnchor(runtimeThreadAnchor({
      threadId: 'thread-2',
      originalText: 'beta',
      type: 'unknown',
    }));
    expect(useReaderStore.getState().threadAnchor).toBeNull();

    useReaderStore.getState().setThreadAnchor(runtimeThreadAnchor({
      threadId: '   ',
      originalText: 'alpha',
      type: 'chat',
    }));
    expect(useReaderStore.getState().threadAnchor).toBeNull();
  });
});
