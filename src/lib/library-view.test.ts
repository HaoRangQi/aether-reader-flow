import { describe, expect, it } from 'vitest';
import { buildLibraryView } from './library-view';
import type { Book, ReadingProgress } from '@/types/domain';

const book = (
  id: string,
  title: string,
  uploadedAt: string,
  extra: Partial<Book> = {},
): Book => ({
  id,
  title,
  fileName: `${title}.pdf`,
  totalPages: 100,
  totalChapters: 10,
  uploadedAt: new Date(uploadedAt),
  language: 'mixed',
  ...extra,
});

const progress = (
  bookId: string,
  overallProgress: number,
  updatedAt: string,
): ReadingProgress => ({
  bookId,
  chapterId: `${bookId}-c1`,
  chapterOrderIndex: 1,
  chapterTitle: 'Chapter 1',
  totalChapters: 10,
  chapterProgress: overallProgress,
  overallProgress,
  updatedAt: new Date(updatedAt),
});

describe('library view', () => {
  const books = [
    book('b1', 'Capital', '2026-01-01T00:00:00Z', { author: '马克思' }),
    book('b2', 'Database Systems', '2026-01-03T00:00:00Z', {
      author: 'Martin Kleppmann',
    }),
    book('b3', 'AI Notes', '2026-01-02T00:00:00Z', { fileName: 'reading-ai.epub' }),
    book('b4', 'Archived Notes', '2026-01-04T00:00:00Z', {
      archivedAt: new Date('2026-01-06T00:00:00Z'),
    }),
  ];

  const progressByBook = {
    b1: progress('b1', 0.35, '2026-01-05T00:00:00Z'),
    b2: progress('b2', 1, '2026-01-04T00:00:00Z'),
  };

  it('filters by title, author, or file name', () => {
    expect(view({ query: 'kleppmann' })).toEqual(['b2']);
    expect(view({ query: 'cap' })).toEqual(['b1']);
    expect(view({ query: 'reading-ai' })).toEqual(['b3']);
    expect(view({ query: 'archived', archive: 'all' })).toEqual(['b4']);
  });

  it('normalizes whitespace in search queries and searchable fields', () => {
    expect(view({ query: 'Database   Systems' })).toEqual(['b2']);
    expect(view({ query: 'reading\nai' })).toEqual(['b3']);
  });

  it('filters by reading status', () => {
    expect(view({ status: 'unread' })).toEqual(['b3']);
    expect(view({ status: 'reading' })).toEqual(['b1']);
    expect(view({ status: 'completed' })).toEqual(['b2']);
  });

  it('hides archived books by default and can show archived books', () => {
    expect(view()).toEqual(['b1', 'b2', 'b3']);
    expect(view({ archive: 'archived' })).toEqual(['b4']);
    expect(view({ archive: 'all' })).toEqual(['b1', 'b2', 'b4', 'b3']);
  });

  it('sorts by recent activity by default', () => {
    expect(view()).toEqual(['b1', 'b2', 'b3']);
  });

  it('sorts by upload date, title, and progress', () => {
    expect(view({ sortKey: 'uploaded' })).toEqual(['b2', 'b3', 'b1']);
    expect(view({ sortKey: 'title' })).toEqual(['b3', 'b1', 'b2']);
    expect(view({ sortKey: 'progress' })).toEqual(['b2', 'b1', 'b3']);
  });

  it('falls back from invalid activity dates for predictable recent sorting', () => {
    const importedBooks = [
      book('valid-progress', 'Valid Progress', '2026-02-02T00:00:00Z'),
      book('invalid-progress', 'Invalid Progress', '2026-02-01T00:00:00Z', {
        lastReadAt: new Date('2026-02-04T00:00:00Z'),
      }),
      book('invalid-upload', 'Invalid Upload', 'not-a-date'),
    ];
    const importedProgress = {
      'valid-progress': progress(
        'valid-progress',
        0.2,
        '2026-02-03T00:00:00Z',
      ),
      'invalid-progress': progress('invalid-progress', 0.4, 'not-a-date'),
    };

    expect(
      buildLibraryView(importedBooks, importedProgress, {
        query: '',
        sortKey: 'recent',
        status: 'all',
        archive: 'active',
      }).map(item => item.id),
    ).toEqual(['invalid-progress', 'valid-progress', 'invalid-upload']);
  });

  it('recovers from invalid runtime view options', () => {
    expect(
      buildLibraryView(books, progressByBook, {
        query: null,
        sortKey: 'unknown',
        status: 'stale',
        archive: 'deleted',
      } as never).map(item => item.id),
    ).toEqual(['b1', 'b2', 'b3']);
  });

  it('ignores invalid searchable text from imported records', () => {
    const importedBooks = [
      book('invalid-title', 'Broken Title', '2026-03-01T00:00:00Z', {
        title: null,
        author: 42,
        fileName: { name: 'broken.pdf' },
      } as never),
      book('valid-title', 'Valid Import', '2026-03-02T00:00:00Z', {
        author: 'Clean Author',
      }),
    ];

    expect(
      buildLibraryView(importedBooks, {}, {
        query: 'clean',
        sortKey: 'recent',
        status: 'all',
        archive: 'active',
      }).map(item => item.id),
    ).toEqual(['valid-title']);

    expect(
      buildLibraryView(importedBooks, {}, {
        query: '',
        sortKey: 'title',
        status: 'all',
        archive: 'active',
      }).map(item => item.id),
    ).toEqual(['invalid-title', 'valid-title']);
  });

  function view(
    patch: Partial<Parameters<typeof buildLibraryView>[2]> = {},
  ): string[] {
    return buildLibraryView(books, progressByBook, {
      query: '',
      sortKey: 'recent',
      status: 'all',
      archive: 'active',
      ...patch,
    }).map(item => item.id);
  }
});
