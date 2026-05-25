/**
 * @fileoverview EpubParser — DocumentParser impl for EPUB files.
 *
 * EPUB structure (simplified):
 *   container.xml   → points to the .opf manifest
 *   .opf            → lists all spine items (chapter order) + metadata
 *   .ncx OR nav.xhtml → table of contents
 *   *.xhtml         → actual chapter content (HTML)
 *
 * Strategy:
 *   1. unzip with JSZip
 *   2. Read META-INF/container.xml → find OPF path
 *   3. Parse OPF → get spine (chapter order), manifest (file map), metadata
 *   4. For each spine item:
 *        - Read its xhtml
 *        - Extract title from first <h1>/<h2>/<title>
 *        - Extract plain text from <body>
 *   5. Emit ParsedDocument with one "page" per spine item, outline built
 *      from titles found.
 *
 * This is a pragmatic implementation, not a full EPUB conformance suite.
 * It handles EPUB 2 and EPUB 3 since both expose the same OPF spine.
 *
 * Anti-goals:
 *   - We do NOT render images, CSS, or fonts.
 *   - We do NOT preserve EPUB's HTML structure inside content (just text).
 *   - DRM'd / encrypted EPUBs will fail at unzip — we surface the error.
 */
import JSZip from 'jszip';
import type { DocumentParser, ParsedDocument, ParsedOutlineItem } from './types';

export class EpubParser implements DocumentParser {
  async parse(file: Blob): Promise<ParsedDocument> {
    const zip = await JSZip.loadAsync(file);

    // 1. container.xml → OPF path
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('EPUB: missing META-INF/container.xml — not a valid EPUB.');
    }
    const containerXml = await containerFile.async('string');
    const opfPath = extractOpfPath(containerXml);
    if (!opfPath) {
      throw new Error('EPUB: cannot locate .opf file in container.xml');
    }

    // 2. OPF → manifest + spine + metadata
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error(`EPUB: OPF file not found at ${opfPath}`);
    }
    const opfXml = await opfFile.async('string');
    const opfBaseDir = opfPath.includes('/') ? opfPath.replace(/[^/]*$/, '') : '';
    const { manifest, spine, metadata } = parseOpf(opfXml);

    // 3. Walk spine → extract text + title per chapter
    const pageTexts: string[] = [];
    const outline: ParsedOutlineItem[] = [];
    for (const itemId of spine) {
      const href = manifest.get(itemId);
      if (!href) continue;
      const fullPath = normalizePath(opfBaseDir + normalizeHref(href));
      const xhtmlFile = zip.file(fullPath);
      if (!xhtmlFile) continue;
      const xhtml = await xhtmlFile.async('string');
      const { title, text } = extractFromXhtml(xhtml);
      pageTexts.push(text);
      if (title) {
        outline.push({ title, pageNumber: pageTexts.length });
      }
    }

    if (pageTexts.length === 0) {
      throw new Error('EPUB: no readable spine content found.');
    }

    return {
      totalPages: pageTexts.length,
      pageTexts,
      outline,
      metadata,
    };
  }
}

// ---------- helpers ---------------------------------------------------------

/** Extracts the OPF rootfile path from container.xml. */
function extractOpfPath(containerXml: string): string | null {
  const m = containerXml.match(/<rootfile[^>]+full-path=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

interface OpfData {
  manifest: Map<string, string>; // id → href
  spine: string[]; // idrefs in order
  metadata: { title?: string; author?: string };
}

/**
 * Tiny OPF parser. Uses regex rather than DOMParser so it runs identically
 * in Node test env and browser. Sufficient for well-formed EPUBs we expect
 * users to upload; will not survive a deliberately malformed OPF.
 */
function parseOpf(opfXml: string): OpfData {
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfXml)) !== null) {
    manifest.set(m[1], m[2]);
  }
  // Some EPUBs put href before id — second pass with reversed pattern.
  const itemReReverse = /<item\b[^>]*\bhref=["']([^"']+)["'][^>]*\bid=["']([^"']+)["']/gi;
  while ((m = itemReReverse.exec(opfXml)) !== null) {
    if (!manifest.has(m[2])) manifest.set(m[2], m[1]);
  }

  const spine: string[] = [];
  const itemrefRe = /<itemref\b[^>]*\bidref=["']([^"']+)["']/gi;
  while ((m = itemrefRe.exec(opfXml)) !== null) {
    spine.push(m[1]);
  }

  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const metadata = {
    title: titleMatch ? decodeXmlEntities(titleMatch[1]).trim() : undefined,
    author: authorMatch ? decodeXmlEntities(authorMatch[1]).trim() : undefined,
  };

  return { manifest, spine, metadata };
}

/** Extracts (title, text) from a chapter's xhtml. */
function extractFromXhtml(xhtml: string): { title?: string; text: string } {
  const titleMatch =
    xhtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    xhtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) ??
    xhtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim() : undefined;

  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : xhtml;
  const text = stripTags(bodyHtml)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title: title && title.length > 0 ? title : undefined, text };
}

/** Removes all HTML/XML tags, replaces block tags with newlines. */
function stripTags(html: string): string {
  return decodeXmlEntities(
    html
      .replace(/<(p|div|br|li|h[1-6]|tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, ''),
  );
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Removes URL fragments and decodes percent-escaped paths without throwing. */
function normalizeHref(href: string): string {
  const withoutFragment = href.split('#', 1)[0];
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

/** Resolves `..` segments so the path inside the zip is canonical. */
function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
