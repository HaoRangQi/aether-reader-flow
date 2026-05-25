import type { ChapterSummary } from '@/types/domain';

export interface ParseChapterSummaryOptions {
  modelUsed: string;
  generatedAt?: Date;
}

type SectionKey = 'corePoints' | 'keyConcepts' | 'argumentFlow' | 'openQuestions';

const SECTION_ALIASES: Record<SectionKey, string[]> = {
  corePoints: ['核心论点', '核心观点', '主要论点', '核心要点'],
  keyConcepts: ['关键概念', '核心概念', '重要概念', '关键词'],
  argumentFlow: ['论证逻辑', '论证流程', '逻辑脉络', '结构脉络'],
  openQuestions: ['章末思考', '开放问题', '思考问题', '延伸思考'],
};

const SECTION_BY_TITLE = new Map(
  Object.entries(SECTION_ALIASES).flatMap(([section, aliases]) =>
    aliases.map(alias => [normalizeTitle(alias), section as SectionKey]),
  ),
);

/**
 * Parses an AI Markdown chapter summary into the durable ChapterSummary shape.
 * Best-effort by design: unknown or malformed structures fall back to a compact
 * single core point so callers can still render something useful.
 */
export function parseChapterSummary(
  text: string,
  options: ParseChapterSummaryOptions,
): ChapterSummary {
  const sections = splitSummarySections(text);
  const corePoints = extractSummaryList(sections.corePoints ?? '');
  const keyConcepts = extractSummaryList(sections.keyConcepts ?? '');
  const argumentFlow = normalizeBodyText(sections.argumentFlow ?? '');
  const openQuestions = extractSummaryList(sections.openQuestions ?? '');
  const fallback = buildFallbackCorePoint(text);

  return {
    corePoints: corePoints.length ? corePoints : fallback,
    keyConcepts,
    argumentFlow,
    openQuestions,
    generatedAt: options.generatedAt ?? new Date(),
    modelUsed: options.modelUsed,
  };
}

export function normalizeChapterSummary(value: unknown): ChapterSummary | null {
  if (!isRecord(value)) return null;
  const corePoints = normalizedStringArray(value.corePoints);
  const keyConcepts = normalizedStringArray(value.keyConcepts);
  const openQuestions = normalizedStringArray(value.openQuestions);
  const argumentFlow = typeof value.argumentFlow === 'string' ? value.argumentFlow.trim() : '';
  const generatedAt = normalizeDate(value.generatedAt);
  const modelUsed = typeof value.modelUsed === 'string' ? value.modelUsed.trim() : '';

  if (!corePoints || !keyConcepts || !openQuestions || !generatedAt || !modelUsed) {
    return null;
  }

  return {
    corePoints,
    keyConcepts,
    argumentFlow,
    openQuestions,
    generatedAt,
    modelUsed,
  };
}

export function extractSummaryList(blob: string): string[] {
  return blob
    .split('\n')
    .map(line => cleanListLine(line))
    .filter(line => line.length > 0);
}

function splitSummarySections(text: string): Partial<Record<SectionKey, string>> {
  const sections: Partial<Record<SectionKey, string>> = {};
  let activeSection: SectionKey | null = null;
  let activeLines: string[] = [];

  const flush = () => {
    if (!activeSection) return;
    const value = activeLines.join('\n').trim();
    if (value.length > 0) {
      sections[activeSection] = value;
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const inlineSection = sectionFromInlineHeading(line);
    if (inlineSection) {
      flush();
      activeSection = inlineSection.section;
      activeLines = inlineSection.content ? [inlineSection.content] : [];
      continue;
    }

    const section = sectionFromHeading(line);
    if (section) {
      flush();
      activeSection = section;
      activeLines = [];
      continue;
    }

    if (activeSection) {
      activeLines.push(line);
    }
  }

  flush();
  return sections;
}

function sectionFromInlineHeading(line: string): { section: SectionKey; content: string } | null {
  const normalizedLine = stripLeadingNumbering(stripHeadingMarkdown(line)).trim();

  for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const alias of aliases) {
      const pattern = new RegExp(`^${escapeRegExp(alias)}\\s*[:：]\\s*(.+)$`);
      const match = normalizedLine.match(pattern);
      if (match?.[1]?.trim()) {
        return { section: section as SectionKey, content: stripHeadingMarkdown(match[1].trim()) };
      }
    }
  }

  return null;
}

function sectionFromHeading(line: string): SectionKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const withoutMarkdown = stripHeadingMarkdown(trimmed);

  const withoutTrailingColon = withoutMarkdown
    .replace(/\s*[:：]\s*$/, '')
    .replace(/\s*\*{1,2}$/, '');
  const title = normalizeTitle(stripLeadingNumbering(withoutTrailingColon));
  return SECTION_BY_TITLE.get(title) ?? null;
}

function stripHeadingMarkdown(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*{1,2}\s*/, '')
    .replace(/\s*\*{1,2}$/, '')
    .trim();
}

function stripLeadingNumbering(title: string): string {
  return title
    .replace(/^\s*(?:第\s*)?[一二三四五六七八九十百]+(?:[章节部分])?\s*[、.)）:：-]?\s*/, '')
    .replace(/^\s*(?:\d+|[A-Za-z])\s*[、.)）:：-]\s*/, '')
    .replace(/^\s*[（(][一二三四五六七八九十百\d]+[）)]\s*/, '')
    .trim();
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').trim();
}

function cleanListLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*+•]\s*/, '')
    .replace(/^\d+[.)、）]\s*/, '')
    .replace(/^[（(][一二三四五六七八九十百\d]+[）)]\s*/, '')
    .replace(/^[一二三四五六七八九十百]+[、.)]\s*/, '')
    .trim();
}

function normalizeBodyText(blob: string): string {
  return blob
    .split('\n')
    .map(line => cleanListLine(line))
    .filter(line => line.length > 0)
    .join('\n');
}

function buildFallbackCorePoint(text: string): string[] {
  const fallback = normalizeBodyText(text).slice(0, 500);
  return fallback ? [fallback] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizedStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    return null;
  }
  return value.map(item => item.trim()).filter(item => item.length > 0);
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
