import { describe, expect, it } from 'vitest';
import { compactChatMemory, type ChatHistoryMessage } from './chat-memory';

const msg = (role: ChatHistoryMessage['role'], content: string): ChatHistoryMessage => ({
  role,
  content,
});

describe('compactChatMemory', () => {
  it('returns short history unchanged', () => {
    const history = [msg('user', 'hello'), msg('assistant', 'hi')];
    expect(compactChatMemory(history, { maxHistoryChars: 100 })).toEqual({ history });
  });

  it('filters empty messages before returning or compacting history', () => {
    const result = compactChatMemory(
      [
        msg('user', '   '),
        msg('user', 'hello'),
        msg('assistant', '\n\t'),
        msg('assistant', 'hi'),
      ],
      { maxHistoryChars: 100 },
    );

    expect(result).toEqual({
      history: [msg('user', 'hello'), msg('assistant', 'hi')],
    });
  });

  it('normalizes retained message whitespace before budget checks', () => {
    const result = compactChatMemory(
      [
        msg('user', '  first\n\nquestion  '),
        msg('assistant', '\tfirst   answer\t'),
        msg('user', '  current\nquestion  '),
      ],
      { maxHistoryChars: 44 },
    );

    expect(result).toEqual({
      history: [
        msg('user', 'first question'),
        msg('assistant', 'first answer'),
        msg('user', 'current question'),
      ],
    });
  });

  it('ignores malformed runtime messages before compacting history', () => {
    const history = [
      msg('user', 'hello'),
      { role: 'system', content: 'do not leak' },
      { role: 'assistant', content: 42 },
      null,
      msg('assistant', 'hi'),
    ] as unknown as ChatHistoryMessage[];

    expect(compactChatMemory(history, { maxHistoryChars: 100 })).toEqual({
      history: [msg('user', 'hello'), msg('assistant', 'hi')],
    });
  });

  it('keeps the latest user message when history exceeds the budget', () => {
    const result = compactChatMemory(
      [
        msg('user', 'old question '.repeat(20)),
        msg('assistant', 'old answer '.repeat(20)),
        msg('user', 'current question'),
      ],
      { maxHistoryChars: 30 },
    );

    expect(result.history).toEqual([msg('user', 'current question')]);
    expect(result.memorySummary).toContain('old question');
    expect(result.memorySummary).toContain('old answer');
  });

  it('preserves chronological order for retained turns', () => {
    const result = compactChatMemory(
      [
        msg('user', 'u1'.repeat(50)),
        msg('assistant', 'a1'.repeat(50)),
        msg('user', 'u2'),
        msg('assistant', 'a2'),
        msg('user', 'u3'),
      ],
      { maxHistoryChars: 20 },
    );

    expect(result.history.map(message => message.content)).toEqual(['u2', 'a2', 'u3']);
  });

  it('does not start retained history with an assistant turn when older user context was removed', () => {
    const result = compactChatMemory(
      [
        msg('user', 'large question '.repeat(20)),
        msg('assistant', 'assistant only in budget'),
        msg('user', 'last'),
      ],
      { maxHistoryChars: 30 },
    );

    expect(result.history[0]).toEqual(msg('user', 'last'));
    expect(result.memorySummary).toContain('assistant only in budget');
  });

  it('bounds the generated memory summary', () => {
    const result = compactChatMemory(
      [
        msg('user', 'first '.repeat(100)),
        msg('assistant', 'second '.repeat(100)),
        msg('user', 'current'),
      ],
      { maxHistoryChars: 20, maxSummaryChars: 80, maxSummaryItemChars: 40 },
    );

    expect(result.memorySummary?.length).toBeLessThanOrEqual(80);
    expect(result.memorySummary).toContain('…');
  });

  it('keeps summary generation stable when summary budgets are invalid', () => {
    const result = compactChatMemory(
      [
        msg('user', 'first message'),
        msg('assistant', 'second message'),
        msg('user', 'current'),
      ],
      { maxHistoryChars: 8, maxSummaryChars: Number.NaN, maxSummaryItemChars: -10 },
    );

    expect(result.history).toEqual([msg('user', 'current')]);
    expect(result.memorySummary).toBe('…');
  });
});
