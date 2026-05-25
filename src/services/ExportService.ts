/**
 * @fileoverview ExportService — renders a book's timeline as Markdown or
 * self-contained HTML.
 *
 * Output structure (both formats):
 *   - Book title + author + export timestamp
 *   - For each chapter that has entries:
 *     - Chapter heading
 *     - For each entry in chronological order:
 *       - Type tag + timestamp
 *       - Original selection (if any)
 *       - User question (if any)
 *       - AI response
 *       - Sources (if verify)
 *       - Confidence (if verify)
 *       - Model + token + cost metadata
 *
 * HTML output is self-contained: inline `<style>`, no external assets.
 * All user/AI content is HTML-escaped — a malicious AI response can't
 * inject scripts or alter the exported file's structure.
 *
 * MD output uses standard fences and CommonMark; opens cleanly in
 * Obsidian / Typora / VS Code.
 */
import JSZip from 'jszip';
import type { Annotation, Book, Chapter, SourceRef, TaskType, TimelineEntry } from '@/types/domain';
import type {
  AnnotationRepo,
  BookRepo,
  ChapterRepo,
  TimelineRepo,
} from '@/adapters/storage/interfaces';

const TYPE_LABEL: Record<TaskType, string> = {
  translate: '翻译',
  explain: '解释',
  verify: '验证',
  summarize: '总结',
  chat: '对话',
};

const ANNOTATION_LABEL: Record<Annotation['type'], string> = {
  highlight: '高亮',
  note: '笔记',
};

const COLOR_LABEL: Record<Annotation['color'], string> = {
  important: '重要',
  question: '疑问',
  insight: '精彩',
  todo: '待查',
};

const SAFE_SOURCE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function fmtTime(d: Date): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yamlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function renderMarkdownFrontmatter(book: Book, exportedAt: Date): string[] {
  const lines = [
    '---',
    'document_type: reading_export',
    'app: aether-reader-flow',
    `title: ${yamlString(book.title)}`,
  ];
  if (book.author) lines.push(`author: ${yamlString(book.author)}`);
  lines.push(
    `source_file: ${yamlString(book.fileName)}`,
    `language: ${book.language}`,
    `total_pages: ${book.totalPages}`,
    `total_chapters: ${book.totalChapters}`,
    `exported_at: ${yamlString(exportedAt.toISOString())}`,
    'tags:',
    '  - aether-reader-flow',
    '  - reading-export',
    '---',
    '',
  );
  return lines;
}

/** Restrict filename to safe characters for cross-OS downloads. */
export function sanitizeExportFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w一-鿿]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  if (!cleaned || isWindowsReservedName(cleaned)) return 'export';
  return cleaned;
}

export type ExportFormat = 'markdown' | 'html';
export type ExportTemplate = 'full-report' | 'verification-only' | 'annotations-only';

export interface ExportFilter {
  /** If provided, only entries belonging to these chapter ids are included. */
  chapterIds?: string[];
  /** If provided, only entries newer or equal to this timestamp. */
  from?: Date;
  /** If provided, only entries older than this timestamp. */
  to?: Date;
  /** Defaults to the complete reading report. */
  template?: ExportTemplate;
}

interface LoadedData {
  book: Book;
  chapters: Chapter[];
  entriesByChapter: Map<string, TimelineEntry[]>;
  annotationsByChapter: Map<string, Annotation[]>;
}

export class ExportService {
  constructor(
    private books: BookRepo,
    private chapters: ChapterRepo,
    private timeline: TimelineRepo,
    private annotations?: AnnotationRepo,
  ) {}

  private async loadData(bookId: string, filter: ExportFilter): Promise<LoadedData> {
    const template = filter.template ?? 'full-report';
    const book = await this.books.get(bookId);
    if (!book) throw new Error(`Book ${bookId} not found`);
    const allChapters = await this.chapters.listByBook(bookId);
    const chapters = filter.chapterIds
      ? allChapters.filter(c => filter.chapterIds!.includes(c.id))
      : allChapters;
    const allEntries = await this.timeline.listByBook(bookId);
    const filtered = allEntries
      .filter(e => {
        if (filter.from && new Date(e.timestamp) < filter.from) return false;
        if (filter.to && new Date(e.timestamp) >= filter.to) return false;
        if (filter.chapterIds && !filter.chapterIds.includes(e.chapterId)) return false;
        if (template === 'annotations-only') return false;
        if (template === 'verification-only' && e.type !== 'verify') return false;
        return true;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const entriesByChapter = new Map<string, TimelineEntry[]>();
    const annotationsByChapter = new Map<string, Annotation[]>();
    for (const c of chapters) entriesByChapter.set(c.id, []);
    for (const c of chapters) annotationsByChapter.set(c.id, []);
    for (const e of filtered) {
      if (entriesByChapter.has(e.chapterId)) {
        entriesByChapter.get(e.chapterId)!.push(e);
      }
    }

    if (this.annotations && template !== 'verification-only') {
      const allAnnotations = await this.annotations.listByBook(bookId);
      for (const a of allAnnotations) {
        if (filter.chapterIds && !filter.chapterIds.includes(a.chapterId)) continue;
        if (annotationsByChapter.has(a.chapterId)) {
          annotationsByChapter.get(a.chapterId)!.push(a);
        }
      }
      for (const list of annotationsByChapter.values()) {
        list.sort((a, b) => a.anchor.start - b.anchor.start);
      }
    }

    return { book, chapters, entriesByChapter, annotationsByChapter };
  }

  // ---------- Markdown ----------------------------------------------------

  async toMarkdown(bookId: string, filter: ExportFilter = {}): Promise<string> {
    const { book, chapters, entriesByChapter, annotationsByChapter } =
      await this.loadData(bookId, filter);
    const out: string[] = [];
    const exportedAt = new Date();
    out.push(...renderMarkdownFrontmatter(book, exportedAt));
    out.push(`# ${book.title}`);
    if (book.author) out.push(`*作者：${book.author}*`);
    out.push(`*导出于：${fmtTime(exportedAt)}*`);
    out.push('');

    let hasAnyContent = false;
    for (const c of chapters) {
      const entries = entriesByChapter.get(c.id) ?? [];
      const annotations = annotationsByChapter.get(c.id) ?? [];
      if (entries.length === 0 && annotations.length === 0) continue;
      hasAnyContent = true;
      out.push(`## ${c.orderIndex}. ${c.title}`);
      out.push('');
      if (annotations.length > 0) {
        out.push('### 批注与高亮');
        out.push('');
        for (const a of annotations) out.push(this.renderAnnotationMarkdown(a));
      }
      for (const e of entries) {
        out.push(this.renderEntryMarkdown(e));
      }
    }

    if (!hasAnyContent) {
      out.push(`*（${emptyTemplateMessage(filter.template)}）*`);
    }

    return out.join('\n');
  }

  async toZip(
    bookIds: string[],
    options: { format: ExportFormat; filter?: ExportFilter },
  ): Promise<Blob> {
    const uniqueBookIds = [...new Set(bookIds)];
    if (uniqueBookIds.length === 0) {
      throw new Error('No books selected for export');
    }
    const zip = new JSZip();
    const usedNames = new Map<string, number>();
    const ext = options.format === 'markdown' ? 'md' : 'html';
    const mime = options.format === 'markdown' ? 'text/markdown' : 'text/html';

    for (const bookId of uniqueBookIds) {
      const book = await this.books.get(bookId);
      if (!book) throw new Error(`Book ${bookId} not found`);
      const baseName = sanitizeExportFilename(book.title);
      const filename = uniqueFilename(baseName, ext, usedNames);
      const content = options.format === 'markdown'
        ? await this.toMarkdown(bookId, options.filter)
        : await this.toHTML(bookId, options.filter);
      zip.file(filename, content, { binary: false, date: new Date(), createFolders: false });
    }

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      comment: `Aether Reader Flow ${options.format} export (${mime})`,
    });
  }

  private renderEntryMarkdown(e: TimelineEntry): string {
    const lines: string[] = [];
    lines.push(`### [${TYPE_LABEL[e.type]}] ${fmtTime(e.timestamp)}`);
    lines.push('');
    if (e.originalText) {
      lines.push('> ' + e.originalText.replace(/\n/g, '\n> '));
      lines.push('');
    }
    if (e.userInput) {
      lines.push(`**问：** ${e.userInput}`);
      lines.push('');
    }
    lines.push(e.aiResponse);
    lines.push('');
    if (e.sources && e.sources.length) {
      lines.push('**来源：**');
      e.sources.forEach((s, i) => lines.push(`${i + 1}. ${renderSourceMarkdown(s, i)}`));
      lines.push('');
    }
    if (e.confidence) {
      lines.push(`**置信度：** ${e.confidence}`);
      lines.push('');
    }
    const location = renderEntryLocation(e);
    if (location) {
      lines.push(`*${location}*`);
      lines.push('');
    }
    lines.push(`*${renderEntryMetadata(e)}*`);
    lines.push('');
    return lines.join('\n');
  }

  private renderAnnotationMarkdown(a: Annotation): string {
    const lines: string[] = [];
    lines.push(
      `#### [${ANNOTATION_LABEL[a.type]} · ${COLOR_LABEL[a.color]}] ${fmtTime(a.createdAt)}`,
    );
    lines.push('');
    lines.push('> ' + a.anchor.quote.replace(/\n/g, '\n> '));
    lines.push('');
    if (a.note) {
      lines.push(a.note);
      lines.push('');
    }
    lines.push(`*位置：${a.anchor.start}-${a.anchor.end}${a.anchor.page ? ` · 第 ${a.anchor.page} 页` : ''}*`);
    lines.push('');
    return lines.join('\n');
  }

  // ---------- HTML --------------------------------------------------------

  async toHTML(bookId: string, filter: ExportFilter = {}): Promise<string> {
    const { book, chapters, entriesByChapter, annotationsByChapter } =
      await this.loadData(bookId, filter);

    const body: string[] = [];
    body.push(`<h1>${escape(book.title)}</h1>`);
    if (book.author) body.push(`<p><em>作者：${escape(book.author)}</em></p>`);
    body.push(`<p><em>导出于：${fmtTime(new Date())}</em></p>`);

    let hasAnyContent = false;
    for (const c of chapters) {
      const entries = entriesByChapter.get(c.id) ?? [];
      const annotations = annotationsByChapter.get(c.id) ?? [];
      if (entries.length === 0 && annotations.length === 0) continue;
      hasAnyContent = true;
      body.push(`<h2>${c.orderIndex}. ${escape(c.title)}</h2>`);
      if (annotations.length > 0) {
        body.push('<h3>批注与高亮</h3>');
        for (const a of annotations) body.push(this.renderAnnotationHTML(a));
      }
      for (const e of entries) body.push(this.renderEntryHTML(e));
    }
    if (!hasAnyContent) body.push(`<p><em>（${emptyTemplateMessage(filter.template)}）</em></p>`);

    return [
      '<!doctype html>',
      '<html lang="zh-CN"><head>',
      '<meta charset="utf-8">',
      `<title>${escape(book.title)}</title>`,
      `<style>${HTML_CSS}</style>`,
      '</head><body>',
      body.join('\n'),
      '</body></html>',
    ].join('\n');
  }

  private renderEntryHTML(e: TimelineEntry): string {
    const parts: string[] = [];
    parts.push('<div class="entry">');
    parts.push(`<span class="tag">${TYPE_LABEL[e.type]}</span>`);
    parts.push(`<span class="time">${fmtTime(e.timestamp)}</span>`);
    if (e.originalText) parts.push(`<blockquote>${escape(e.originalText)}</blockquote>`);
    if (e.userInput) parts.push(`<div class="question">${escape(e.userInput)}</div>`);
    parts.push(`<div class="response">${escape(e.aiResponse)}</div>`);
    if (e.sources && e.sources.length) {
      parts.push('<ol class="sources">');
      for (const s of e.sources) {
        parts.push(`<li>${renderSourceHTML(s)}</li>`);
      }
      parts.push('</ol>');
    }
    if (e.confidence) {
      parts.push(`<span class="confidence confidence-${escape(e.confidence)}">${escape(e.confidence)}</span>`);
    }
    parts.push(`<div class="meta">${escape(renderEntryMetadata(e))}</div>`);
    parts.push('</div>');
    return parts.join('');
  }

  private renderAnnotationHTML(a: Annotation): string {
    const parts: string[] = [];
    parts.push('<div class="annotation">');
    parts.push(`<span class="tag annotation-${escape(a.color)}">${ANNOTATION_LABEL[a.type]} · ${COLOR_LABEL[a.color]}</span>`);
    parts.push(`<span class="time">${fmtTime(a.createdAt)}</span>`);
    parts.push(`<blockquote>${escape(a.anchor.quote)}</blockquote>`);
    if (a.note) parts.push(`<div class="note">${escape(a.note)}</div>`);
    parts.push(`<div class="meta">位置：${a.anchor.start}-${a.anchor.end}${a.anchor.page ? ` · 第 ${a.anchor.page} 页` : ''}</div>`);
    parts.push('</div>');
    return parts.join('');
  }
}

function uniqueFilename(baseName: string, ext: string, usedNames: Map<string, number>): string {
  const count = usedNames.get(baseName) ?? 0;
  usedNames.set(baseName, count + 1);
  return count === 0 ? `${baseName}.${ext}` : `${baseName}_${count + 1}.${ext}`;
}

function isWindowsReservedName(name: string): boolean {
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name);
}

function renderEntryLocation(e: TimelineEntry): string | null {
  const parts: string[] = [];
  const page = e.page ?? e.anchor?.page;
  if (page) parts.push(`第 ${page} 页`);
  if (e.anchor) parts.push(`位置：${e.anchor.start}-${e.anchor.end}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function renderEntryMetadata(e: TimelineEntry): string {
  const parts = [e.aiModel || 'unknown model'];
  const tokens = (e as Partial<TimelineEntry>).costTokens;
  const inputTokens = finiteNumber(tokens?.input);
  const outputTokens = finiteNumber(tokens?.output);
  if (inputTokens !== null && outputTokens !== null) {
    parts.push(`${inputTokens + outputTokens} tokens`);
  } else {
    parts.push('tokens unavailable');
  }
  const amount = finiteNumber((e as Partial<TimelineEntry>).costAmount);
  parts.push(amount === null ? 'cost unavailable' : `$${amount.toFixed(4)}`);
  return parts.join(' · ');
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function emptyTemplateMessage(template: ExportTemplate = 'full-report'): string {
  if (template === 'verification-only') return '暂无验证结果';
  if (template === 'annotations-only') return '暂无批注';
  return '暂无时间轴条目或批注';
}

function renderSourceMarkdown(source: SourceRef, index: number): string {
  const label = sourceLabel(source, index);
  const safeUrl = normalizeSafeSourceUrl(source.url);
  if (!safeUrl) return escapeMarkdownText(label);
  return `[${escapeMarkdownLinkText(label)}](<${escapeMarkdownLinkUrl(safeUrl)}>)`;
}

function renderSourceHTML(source: SourceRef): string {
  const label = sourceLabel(source);
  const safeUrl = normalizeSafeSourceUrl(source.url);
  if (!safeUrl) return escape(label);
  return `<a href="${escape(safeUrl)}" target="_blank" rel="noopener">${escape(label)}</a>`;
}

function sourceLabel(source: SourceRef, index?: number): string {
  return source.title.trim() || source.url.trim() || (index === undefined ? '来源' : `来源 ${index + 1}`);
}

function normalizeSafeSourceUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return SAFE_SOURCE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function escapeMarkdownText(s: string): string {
  return normalizeMarkdownText(s)
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function escapeMarkdownLinkText(s: string): string {
  return normalizeMarkdownText(s)
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function normalizeMarkdownText(s: string): string {
  return s.replace(/\r?\n/g, ' ');
}

function escapeMarkdownLinkUrl(s: string): string {
  return s
    .replace(/\\/g, '%5C')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\r?\n/g, '');
}

const HTML_CSS = `
body { font-family: 'Source Serif Pro', 'Source Han Serif SC', serif;
       background: #FAF8F4; color: #2C2A28; max-width: 720px; margin: 0 auto;
       padding: 48px 24px; line-height: 1.8; }
h1 { font-size: 2rem; margin-bottom: 0.5em; }
h2 { font-size: 1.5rem; margin-top: 3em; padding-bottom: 0.3em;
     border-bottom: 1px solid rgba(0,0,0,0.08); }
h3 { font-size: 1rem; margin-top: 2em; color: #5C5650; }
.entry { margin: 2.5em 0; }
.annotation { margin: 1.5em 0; }
.tag { display: inline-block; padding: 2px 8px; background: rgba(200,120,60,0.12);
       color: #C8783F; border-radius: 4px; font-size: 0.75rem; }
.annotation-important { background: rgba(196,154,60,0.15); color: #9A731F; }
.annotation-question { background: rgba(91,122,150,0.15); color: #4A6884; }
.annotation-insight { background: rgba(74,124,89,0.15); color: #4A7C59; }
.annotation-todo { background: rgba(179,62,42,0.15); color: #B33E2A; }
.time { color: #8A847C; font-size: 0.75rem; margin-left: 8px; }
blockquote { border-left: 2px solid rgba(0,0,0,0.12); margin: 1em 0; padding-left: 1em;
             color: #5C5650; font-style: italic; }
.question { margin: 1em 0; color: #2C2A28; }
.question::before { content: '问：'; color: #8A847C; }
.note { margin: 1em 0; white-space: pre-wrap; }
.response { white-space: pre-wrap; }
.sources { margin-top: 1em; padding-left: 1.2em; font-size: 0.85rem; }
.sources a { color: #5B7A96; }
.meta { color: #8A847C; font-size: 0.75rem; margin-top: 0.5em; }
.confidence { display: inline-block; padding: 1px 6px; border-radius: 3px;
              font-size: 0.75rem; margin-top: 0.5em; }
.confidence-high { background: rgba(74,124,89,0.15); color: #4A7C59; }
.confidence-medium { background: rgba(196,154,60,0.15); color: #C49A3C; }
.confidence-low { background: rgba(179,62,42,0.15); color: #B33E2A; }
`;
