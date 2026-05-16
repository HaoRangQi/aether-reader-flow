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
import type { Book, Chapter, TaskType, TimelineEntry } from '@/types/domain';
import type {
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

export interface ExportFilter {
  /** If provided, only entries belonging to these chapter ids are included. */
  chapterIds?: string[];
  /** If provided, only entries newer or equal to this timestamp. */
  from?: Date;
  /** If provided, only entries older than this timestamp. */
  to?: Date;
}

interface LoadedData {
  book: Book;
  chapters: Chapter[];
  entriesByChapter: Map<string, TimelineEntry[]>;
}

export class ExportService {
  constructor(
    private books: BookRepo,
    private chapters: ChapterRepo,
    private timeline: TimelineRepo,
  ) {}

  private async loadData(bookId: string, filter: ExportFilter): Promise<LoadedData> {
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
        return true;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const entriesByChapter = new Map<string, TimelineEntry[]>();
    for (const c of chapters) entriesByChapter.set(c.id, []);
    for (const e of filtered) {
      if (entriesByChapter.has(e.chapterId)) {
        entriesByChapter.get(e.chapterId)!.push(e);
      }
    }
    return { book, chapters, entriesByChapter };
  }

  // ---------- Markdown ----------------------------------------------------

  async toMarkdown(bookId: string, filter: ExportFilter = {}): Promise<string> {
    const { book, chapters, entriesByChapter } = await this.loadData(bookId, filter);
    const out: string[] = [];
    out.push(`# ${book.title}`);
    if (book.author) out.push(`*作者：${book.author}*`);
    out.push(`*导出于：${fmtTime(new Date())}*`);
    out.push('');

    let hasAnyEntries = false;
    for (const c of chapters) {
      const entries = entriesByChapter.get(c.id) ?? [];
      if (entries.length === 0) continue;
      hasAnyEntries = true;
      out.push(`## ${c.orderIndex}. ${c.title}`);
      out.push('');
      for (const e of entries) {
        out.push(this.renderEntryMarkdown(e));
      }
    }

    if (!hasAnyEntries) {
      out.push('*（暂无时间轴条目）*');
    }

    return out.join('\n');
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
      e.sources.forEach((s, i) => lines.push(`${i + 1}. [${s.title || s.url}](${s.url})`));
      lines.push('');
    }
    if (e.confidence) {
      lines.push(`**置信度：** ${e.confidence}`);
      lines.push('');
    }
    lines.push(
      `*${e.aiModel} · ${e.costTokens.input + e.costTokens.output} tokens · $${e.costAmount.toFixed(4)}*`,
    );
    lines.push('');
    return lines.join('\n');
  }

  // ---------- HTML --------------------------------------------------------

  async toHTML(bookId: string, filter: ExportFilter = {}): Promise<string> {
    const { book, chapters, entriesByChapter } = await this.loadData(bookId, filter);

    const body: string[] = [];
    body.push(`<h1>${escape(book.title)}</h1>`);
    if (book.author) body.push(`<p><em>作者：${escape(book.author)}</em></p>`);
    body.push(`<p><em>导出于：${fmtTime(new Date())}</em></p>`);

    let hasAnyEntries = false;
    for (const c of chapters) {
      const entries = entriesByChapter.get(c.id) ?? [];
      if (entries.length === 0) continue;
      hasAnyEntries = true;
      body.push(`<h2>${c.orderIndex}. ${escape(c.title)}</h2>`);
      for (const e of entries) body.push(this.renderEntryHTML(e));
    }
    if (!hasAnyEntries) body.push('<p><em>（暂无时间轴条目）</em></p>');

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
        parts.push(
          `<li><a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.title || s.url)}</a></li>`,
        );
      }
      parts.push('</ol>');
    }
    if (e.confidence) {
      parts.push(`<span class="confidence confidence-${escape(e.confidence)}">${escape(e.confidence)}</span>`);
    }
    parts.push(
      `<div class="meta">${escape(e.aiModel)} · ${e.costTokens.input + e.costTokens.output} tokens · $${e.costAmount.toFixed(4)}</div>`,
    );
    parts.push('</div>');
    return parts.join('');
  }
}

const HTML_CSS = `
body { font-family: 'Source Serif Pro', 'Source Han Serif SC', serif;
       background: #FAF8F4; color: #2C2A28; max-width: 720px; margin: 0 auto;
       padding: 48px 24px; line-height: 1.8; }
h1 { font-size: 2rem; margin-bottom: 0.5em; }
h2 { font-size: 1.5rem; margin-top: 3em; padding-bottom: 0.3em;
     border-bottom: 1px solid rgba(0,0,0,0.08); }
.entry { margin: 2.5em 0; }
.tag { display: inline-block; padding: 2px 8px; background: rgba(200,120,60,0.12);
       color: #C8783F; border-radius: 4px; font-size: 0.75rem; }
.time { color: #8A847C; font-size: 0.75rem; margin-left: 8px; }
blockquote { border-left: 2px solid rgba(0,0,0,0.12); margin: 1em 0; padding-left: 1em;
             color: #5C5650; font-style: italic; }
.question { margin: 1em 0; color: #2C2A28; }
.question::before { content: '问：'; color: #8A847C; }
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
