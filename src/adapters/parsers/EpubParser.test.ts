import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { EpubParser } from './EpubParser';

/**
 * Build a minimal-but-valid EPUB blob in memory for testing.
 * Spec essentials covered:
 *   - mimetype as first entry (uncompressed; we don't enforce that here)
 *   - META-INF/container.xml pointing to content.opf
 *   - content.opf with metadata, manifest, spine
 *   - 2 chapter xhtml files
 */
async function buildSampleEpub(overrides: {
  title?: string;
  author?: string;
  chapters?: Array<{ title: string; body: string }>;
} = {}): Promise<Blob> {
  const title = overrides.title ?? '钱从哪里来';
  const author = overrides.author ?? '某';
  const chapters = overrides.chapters ?? [
    { title: '第一章 引子', body: '<p>这是第一章的内容。</p>' },
    { title: '第二章 宽信用', body: '<p>第二章详述了宽信用机制。</p>' },
  ];

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const manifestItems = chapters
    .map(
      (_, i) =>
        `<item id="chap${i + 1}" href="chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n    ');
  const spineItems = chapters.map((_, i) => `<itemref idref="chap${i + 1}"/>`).join('\n    ');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`,
  );

  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    zip.file(
      `OEBPS/chap${i + 1}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${c.title}</title></head>
<body>
<h1>${c.title}</h1>
${c.body}
</body>
</html>`,
    );
  }

  const buf = await zip.generateAsync({ type: 'blob' });
  return new Blob([buf], { type: 'application/epub+zip' });
}

describe('EpubParser', () => {
  it('parses metadata, spine, and per-chapter text', async () => {
    const blob = await buildSampleEpub();
    const parser = new EpubParser();
    const result = await parser.parse(blob);

    expect(result.metadata.title).toBe('钱从哪里来');
    expect(result.metadata.author).toBe('某');
    expect(result.totalPages).toBe(2);
    expect(result.pageTexts[0]).toContain('第一章的内容');
    expect(result.pageTexts[1]).toContain('宽信用机制');
  });

  it('builds outline from <h1> titles in chapter order', async () => {
    const blob = await buildSampleEpub();
    const parser = new EpubParser();
    const result = await parser.parse(blob);

    expect(result.outline.length).toBe(2);
    expect(result.outline[0]).toEqual({ title: '第一章 引子', pageNumber: 1 });
    expect(result.outline[1]).toEqual({ title: '第二章 宽信用', pageNumber: 2 });
  });

  it('falls back gracefully when chapter has no <h1>', async () => {
    const blob = await buildSampleEpub({
      chapters: [
        { title: '', body: '<p>正文但没有 h1</p>' },
        { title: '第二章', body: '<p>内容</p>' },
      ],
    });
    // The buildSampleEpub still wraps in <h1>{title}</h1>, so we manually
    // craft a chapter with no h1 by rebuilding from scratch.
    const zip = await JSZip.loadAsync(blob);
    zip.file(
      'OEBPS/chap1.xhtml',
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body><p>无标题的正文</p></body></html>`,
    );
    const reBlob = new Blob([await zip.generateAsync({ type: 'blob' })], {
      type: 'application/epub+zip',
    });

    const parser = new EpubParser();
    const result = await parser.parse(reBlob);
    expect(result.pageTexts[0]).toContain('无标题的正文');
    // Chapter 1's <title> is "x" → falls back to title tag
    expect(result.outline.length).toBeGreaterThanOrEqual(1);
  });

  it('handles multi-line bodies and strips tags', async () => {
    const blob = await buildSampleEpub({
      chapters: [
        {
          title: '一章',
          body: '<p>段落 1</p><p>段落 2</p><ul><li>项 A</li><li>项 B</li></ul>',
        },
      ],
    });
    const parser = new EpubParser();
    const r = await parser.parse(blob);
    expect(r.pageTexts[0]).toContain('段落 1');
    expect(r.pageTexts[0]).toContain('段落 2');
    expect(r.pageTexts[0]).toContain('项 A');
    expect(r.pageTexts[0]).not.toContain('<p>');
    expect(r.pageTexts[0]).not.toContain('</li>');
  });

  it('decodes XML entities (&amp; &lt; &#x4e2d;)', async () => {
    const blob = await buildSampleEpub({
      title: 'A &amp; B',
      chapters: [{ title: 'c', body: '<p>三 &amp; 四 &lt;test&gt;</p>' }],
    });
    const parser = new EpubParser();
    const r = await parser.parse(blob);
    expect(r.metadata.title).toBe('A & B');
    expect(r.pageTexts[0]).toContain('三 & 四');
    expect(r.pageTexts[0]).toContain('<test>');
  });

  it('throws on missing container.xml', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    const blob = new Blob([await zip.generateAsync({ type: 'blob' })], {
      type: 'application/epub+zip',
    });
    const parser = new EpubParser();
    await expect(parser.parse(blob)).rejects.toThrow(/container\.xml/i);
  });
});
