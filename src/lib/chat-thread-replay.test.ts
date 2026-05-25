import { describe, expect, it } from 'vitest';
import { timelineEntriesToChatTurns } from './chat-thread-replay';
import type { TimelineEntry, TaskType } from '@/types/domain';

const entry = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: 'entry',
  bookId: 'book',
  chapterId: 'chapter',
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  type: 'chat' as TaskType,
  originalText: 'selected text',
  userInput: 'user question',
  aiModel: 'model',
  aiResponse: 'assistant answer',
  costTokens: { input: 1, output: 1 },
  costAmount: 0.001,
  persona: 'general',
  ...overrides,
});

describe('timelineEntriesToChatTurns', () => {
  it('returns turns in stable chronological order', () => {
    const turns = timelineEntriesToChatTurns([
      entry({
        id: 'late',
        timestamp: new Date('2026-01-01T00:02:00.000Z'),
        userInput: 'late user',
        aiResponse: 'late assistant',
      }),
      entry({
        id: 'early',
        timestamp: new Date('2026-01-01T00:01:00.000Z'),
        userInput: 'early user',
        aiResponse: 'early assistant',
      }),
      entry({
        id: 'same-time',
        timestamp: new Date('2026-01-01T00:02:00.000Z'),
        userInput: 'same-time user',
        aiResponse: 'same-time assistant',
      }),
    ]);

    expect(turns.map(turn => turn.content)).toEqual([
      'early user',
      'early assistant',
      'late user',
      'late assistant',
      'same-time user',
      'same-time assistant',
    ]);
  });

  it('filters entries by threadId when provided', () => {
    const turns = timelineEntriesToChatTurns(
      [
        entry({ id: 'one', threadId: 'thread-a', userInput: 'a user', aiResponse: 'a assistant' }),
        entry({ id: 'two', threadId: 'thread-b', userInput: 'b user', aiResponse: 'b assistant' }),
      ],
      'thread-b',
    );

    expect(turns).toEqual([
      { role: 'user', content: 'b user' },
      { role: 'assistant', content: 'b assistant' },
    ]);
  });

  it('normalizes imported thread ids before filtering restored chat history', () => {
    const turns = timelineEntriesToChatTurns(
      [
        entry({ id: 'one', threadId: ' thread-a ', userInput: 'a user', aiResponse: 'a assistant' }),
        entry({ id: 'two', threadId: 'thread-b', userInput: 'b user', aiResponse: 'b assistant' }),
      ],
      'thread-a',
    );

    expect(turns).toEqual([
      { role: 'user', content: 'a user' },
      { role: 'assistant', content: 'a assistant' },
    ]);
  });

  it('ignores non-chat timeline entries when rebuilding chat history', () => {
    const turns = timelineEntriesToChatTurns([
      entry({
        id: 'translated',
        type: 'translate',
        userInput: 'translate this',
        aiResponse: 'translated answer',
      }),
      entry({
        id: 'explained',
        type: 'explain',
        originalText: 'selected concept',
        userInput: undefined,
        aiResponse: 'concept explanation',
      }),
      entry({
        id: 'chat',
        type: 'chat',
        userInput: 'chat user',
        aiResponse: 'chat assistant',
      }),
    ]);

    expect(turns).toEqual([
      { role: 'user', content: 'chat user' },
      { role: 'assistant', content: 'chat assistant' },
    ]);
  });

  it('falls back to originalText when userInput is missing', () => {
    const turns = timelineEntriesToChatTurns([
      entry({ userInput: undefined, originalText: 'quoted passage', aiResponse: 'explanation' }),
    ]);

    expect(turns).toEqual([
      { role: 'user', content: 'quoted passage' },
      { role: 'assistant', content: 'explanation' },
    ]);
  });

  it('filters blank content and failed exchanges', () => {
    const turns = timelineEntriesToChatTurns([
      entry({
        userInput: '   ',
        originalText: '  ',
        aiResponse: 'assistant answer',
      }),
      entry({
        userInput: 'valid user',
        aiResponse: 'assistant answer',
      }),
      entry({
        userInput: 'recoverable user',
        aiResponse: '  ',
      }),
      entry({
        userInput: 'failed user',
        aiResponse: '[error]',
      }),
      entry({
        userInput: 'variant failed user',
        aiResponse: ' [ Error ] ',
      }),
      entry({
        userInput: 'stopped user',
        aiResponse: '[已停止生成]',
      }),
      entry({
        userInput: 'variant stopped user',
        aiResponse: '[ 已 停止 生成 ]',
      }),
      entry({
        userInput: 'legacy error user',
        aiResponse: '[出错]',
      }),
      entry({
        userInput: 'legacy error details user',
        aiResponse: '[出错] 模型请求超时',
      }),
      entry({
        userInput: 'hidden user',
        aiResponse: 'hidden assistant',
        error: true,
      } as Partial<TimelineEntry>),
    ]);

    expect(turns).toEqual([
      { role: 'user', content: 'valid user' },
      { role: 'assistant', content: 'assistant answer' },
    ]);
  });

  it('keeps corrupted timestamps from breaking restored chat order', () => {
    const turns = timelineEntriesToChatTurns([
      entry({
        id: 'bad-time',
        timestamp: 'not-a-date' as unknown as Date,
        userInput: 'bad time user',
        aiResponse: 'bad time assistant',
      }),
      entry({
        id: 'dated',
        timestamp: new Date('2026-01-01T00:01:00.000Z'),
        userInput: 'dated user',
        aiResponse: 'dated assistant',
      }),
      entry({
        id: 'missing-time',
        timestamp: undefined as unknown as Date,
        userInput: 'missing time user',
        aiResponse: 'missing time assistant',
      }),
    ]);

    expect(turns.map(turn => turn.content)).toEqual([
      'dated user',
      'dated assistant',
      'bad time user',
      'bad time assistant',
      'missing time user',
      'missing time assistant',
    ]);
  });
});
