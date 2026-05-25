import type { TimelineEntry } from '@/types/domain';

export interface ChatReplayTurn {
  role: 'user' | 'assistant';
  content: string;
}

type ReplayableTimelineEntry = TimelineEntry & {
  error?: boolean;
};

const ERROR_RESPONSE_PREFIXES = ['[出错]', '[error]', '[已停止生成]'];

export function timelineEntriesToChatTurns(
  entries: TimelineEntry[],
  threadId?: string,
): ChatReplayTurn[] {
  const normalizedThreadId = normalizeThreadId(threadId);

  return entries
    .map((entry, index) => ({ entry: entry as ReplayableTimelineEntry, index }))
    .filter(({ entry }) => entry.type === 'chat')
    .filter(({ entry }) =>
      normalizedThreadId ? normalizeThreadId(entry.threadId) === normalizedThreadId : true,
    )
    .filter(({ entry }) => !entry.error)
    .sort((a, b) => {
      const leftTime = toTimestampMs(a.entry.timestamp);
      const rightTime = toTimestampMs(b.entry.timestamp);
      return leftTime === rightTime ? a.index - b.index : leftTime < rightTime ? -1 : 1;
    })
    .flatMap(({ entry }) => entryToChatTurns(entry));
}

function entryToChatTurns(entry: ReplayableTimelineEntry): ChatReplayTurn[] {
  const userContent = normalizeContent(entry.userInput) ?? normalizeContent(entry.originalText);
  const assistantContent = normalizeContent(entry.aiResponse);

  if (!userContent || !assistantContent || isErrorResponse(assistantContent)) return [];

  return [
    { role: 'user', content: userContent },
    { role: 'assistant', content: assistantContent },
  ];
}

function normalizeContent(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeThreadId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isErrorResponse(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return ERROR_RESPONSE_PREFIXES.some(prefix => normalized.startsWith(prefix.toLowerCase()));
}

function toTimestampMs(value: unknown): number {
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value).getTime()
        : Number.POSITIVE_INFINITY;

  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}
