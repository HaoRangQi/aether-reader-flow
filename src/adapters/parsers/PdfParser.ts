/**
 * @fileoverview PDF.js-backed `DocumentParser` implementation.
 *
 * Responsibilities:
 *   1. Decode the binary PDF (via PDF.js's worker)
 *   2. Extract per-page plain text (concatenated text run strings)
 *   3. Flatten the nested PDF outline into a flat `[title, pageNumber][]`
 *   4. Read top-level metadata (Title, Author)
 *
 * Anti-goals:
 *   - We do NOT detect chapters here; that's `lib/chapter-detect.ts`'s job.
 *   - We do NOT OCR scanned PDFs (out of MVP scope, see spec §3.1 F1).
 *   - We do NOT preserve layout, fonts, or images (text-only).
 */
import { configurePdfWorker, pdfjs } from '@/lib/pdf-utils';
import type { DocumentParser, ParsedDocument, ParsedOutlineItem } from './types';

interface OutlineNode {
  title: string;
  dest?: unknown;
  items?: OutlineNode[];
}

export class PdfParser implements DocumentParser {
  async parse(file: Blob): Promise<ParsedDocument> {
    configurePdfWorker();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

    const totalPages = doc.numPages;
    const pageTexts: string[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as Array<{ str?: string }>)
        .map(it => it.str ?? '')
        .join('');
      pageTexts.push(text);
    }

    const metaRaw = await doc.getMetadata();
    const info = (metaRaw?.info ?? {}) as Record<string, unknown>;
    const metadata = {
      title: typeof info.Title === 'string' && info.Title.length > 0 ? info.Title : undefined,
      author: typeof info.Author === 'string' && info.Author.length > 0 ? info.Author : undefined,
    };

    const rawOutline = (await doc.getOutline()) as OutlineNode[] | null;
    const outline = await this.flattenOutline(doc, rawOutline ?? []);

    return { totalPages, pageTexts, outline, metadata };
  }

  /**
   * Walks the (potentially nested) PDF outline tree. Each leaf with a
   * resolvable `dest` becomes one flat `ParsedOutlineItem`.
   *
   * Outline entries whose `dest` we can't resolve (corrupt anchors, named
   * destinations PDF.js doesn't know about) are silently dropped. This is
   * intentional — we'd rather under-segment than crash on a weird PDF.
   *
   * The `doc` parameter is typed loosely (`unknown` for `getPageIndex`'s
   * arg) because PDF.js types `dest` as a strict `RefProxy` but in
   * practice it also accepts string named destinations. We cast at the
   * call site.
   */
  private async flattenOutline(
    doc: { getPageIndex: (d: never) => Promise<number> },
    nodes: OutlineNode[],
    acc: ParsedOutlineItem[] = [],
  ): Promise<ParsedOutlineItem[]> {
    for (const n of nodes) {
      if (n.dest !== undefined && n.dest !== null) {
        try {
          const idx = await doc.getPageIndex(n.dest as never);
          acc.push({ title: n.title, pageNumber: idx + 1 });
        } catch {
          // Skip unresolvable destination; see method JSDoc.
        }
      }
      if (n.items?.length) {
        await this.flattenOutline(doc, n.items, acc);
      }
    }
    return acc;
  }
}
