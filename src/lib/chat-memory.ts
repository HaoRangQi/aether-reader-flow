export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompactChatMemoryOptions {
  maxHistoryChars?: number;
  maxSummaryChars?: number;
  maxSummaryItemChars?: number;
}

export interface CompactChatMemoryResult {
  history: ChatHistoryMessage[];
  memorySummary?: string;
}

const DEFAULT_MAX_HISTORY_CHARS = 12_000;
const DEFAULT_MAX_SUMMARY_CHARS = 1_800;
const DEFAULT_MAX_SUMMARY_ITEM_CHARS = 240;

export function compactChatMemory(
  history: ChatHistoryMessage[],
  options: CompactChatMemoryOptions = {},
): CompactChatMemoryResult {
  const normalizedHistory = history
    .filter(isChatHistoryMessage)
    .map(message => ({ ...message, content: normalizeText(message.content) }))
    .filter(message => message.content.length > 0);
  if (normalizedHistory.length === 0) return { history: [] };

  const totalChars = normalizedHistory.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
  const maxHistoryChars = Math.max(1, options.maxHistoryChars ?? DEFAULT_MAX_HISTORY_CHARS);
  if (totalChars <= maxHistoryChars) {
    return { history: [...normalizedHistory] };
  }

  const lastUserIndex = findLastUserIndex(normalizedHistory);
  const selected = new Set<number>();
  let usedChars = 0;

  for (let index = normalizedHistory.length - 1; index >= 0; index -= 1) {
    const message = normalizedHistory[index];
    const required = lastUserIndex !== -1 && index >= lastUserIndex;
    if (required || usedChars + message.content.length <= maxHistoryChars) {
      selected.add(index);
      usedChars += message.content.length;
    }
  }

  const keptEntries = normalizedHistory
    .map((message, index) => ({ message, index }))
    .filter(entry => selected.has(entry.index));
  while (keptEntries.length > 1 && keptEntries[0]?.message.role === 'assistant') {
    keptEntries.shift();
  }

  const keptIndexes = new Set(keptEntries.map(entry => entry.index));
  const omitted = normalizedHistory.filter((_, index) => !keptIndexes.has(index));
  return {
    history: keptEntries.map(entry => entry.message),
    memorySummary: buildMemorySummary(omitted, {
      maxSummaryChars: clampPositiveInt(
        options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS,
      ),
      maxSummaryItemChars: clampPositiveInt(
        options.maxSummaryItemChars ?? DEFAULT_MAX_SUMMARY_ITEM_CHARS,
      ),
    }),
  };
}

function findLastUserIndex(history: ChatHistoryMessage[]): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].role === 'user') return index;
  }
  return -1;
}

function isChatHistoryMessage(value: unknown): value is ChatHistoryMessage {
  if (!value || typeof value !== 'object') return false;

  const message = value as Record<string, unknown>;
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
}

function buildMemorySummary(
  messages: ChatHistoryMessage[],
  options: { maxSummaryChars: number; maxSummaryItemChars: number },
): string | undefined {
  if (messages.length === 0) return undefined;
  const lines = messages.map(message => {
    const label = message.role === 'user' ? '用户' : '助手';
    return `${label}：${truncate(normalizeText(message.content), options.maxSummaryItemChars)}`;
  });

  const selected: string[] = [];
  let usedChars = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (selected.length > 0 && usedChars + line.length + 1 > options.maxSummaryChars) break;
    if (selected.length === 0 && line.length > options.maxSummaryChars) {
      selected.unshift(truncate(line, options.maxSummaryChars));
      break;
    }
    selected.unshift(line);
    usedChars += line.length + 1;
  }

  return selected.join('\n');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clampPositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}
