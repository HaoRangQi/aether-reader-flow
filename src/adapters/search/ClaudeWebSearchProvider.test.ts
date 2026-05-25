import { describe, expect, it } from 'vitest';
import { parseSourcesFromJSON } from './ClaudeWebSearchProvider';

describe('parseSourcesFromJSON', () => {
  it('extracts sources from wrapped JSON arrays', () => {
    const sources = parseSourcesFromJSON(`
      Here are sources:
      [
        {
          "url": "https://example.com/report",
          "title": " Report title ",
          "snippet": " Useful snippet ",
          "publishedAt": "2026-01-02T00:00:00.000Z"
        }
      ]
    `);

    expect(sources).toEqual([
      {
        url: 'https://example.com/report',
        title: 'Report title',
        snippet: 'Useful snippet',
        publishedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
  });

  it('drops unsafe or incomplete source refs and ignores invalid dates', () => {
    const sources = parseSourcesFromJSON(JSON.stringify([
      null,
      'not an object',
      {
        url: 'https://user:pass@example.com/private',
        title: 'Credentials',
      },
      {
        url: 'javascript:alert(1)',
        title: 'Script',
      },
      {
        url: 'https://example.com/blank-title',
        title: '   ',
      },
      {
        url: 'https://example.com/valid',
        title: 'Valid',
        snippet: '  trimmed  ',
        publishedAt: 'not-a-date',
      },
    ]));

    expect(sources).toEqual([
      {
        url: 'https://example.com/valid',
        title: 'Valid',
        snippet: 'trimmed',
        publishedAt: undefined,
      },
    ]);
  });

  it('returns an empty list for malformed JSON output', () => {
    expect(parseSourcesFromJSON('not json')).toEqual([]);
    expect(parseSourcesFromJSON('[{"url": "https://example.com"')).toEqual([]);
  });
});
