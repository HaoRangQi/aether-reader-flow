import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@/stores/configStore';
import type { Book, ReadingProgress } from '@/types/domain';
import { BookCard } from './BookCard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./ExportDialog', () => ({
  ExportDialog: () => null,
}));

const initialConfigState = useConfigStore.getState();

describe('BookCard', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
    });
  });

  it('clamps out-of-range reading progress before rendering percent and width', () => {
    const { rerender } = render(
      <BookCard book={book()} progress={progress({ overallProgress: 1.42 })} />,
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveStyle({
      width: '100%',
    });

    rerender(<BookCard book={book()} progress={progress({ overallProgress: -0.5 })} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveStyle({
      width: '0%',
    });
  });

  it('renders non-finite reading progress as zero instead of leaking NaN into UI', () => {
    render(<BookCard book={book()} progress={progress({ overallProgress: Number.NaN })} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getByRole('progressbar', { name: '边界测试 阅读进度' })).toHaveStyle({
      width: '0%',
    });
  });

  it('treats future or invalid recent-read timestamps as just now', () => {
    const { rerender } = render(
      <BookCard
        book={book()}
        progress={progress({ updatedAt: new Date(Date.now() + 60_000) })}
      />,
    );

    expect(screen.getByText('最近阅读 刚刚')).toBeInTheDocument();

    rerender(
      <BookCard
        book={book({ lastReadAt: new Date(Number.NaN) })}
        progress={undefined}
      />,
    );

    expect(screen.getByText('最近阅读 刚刚')).toBeInTheDocument();
  });
});

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: '边界测试',
    fileName: 'edge.pdf',
    totalPages: 120,
    totalChapters: 6,
    uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
    language: 'zh',
    ...overrides,
  };
}

function progress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    bookId: 'book-1',
    chapterId: 'chapter-1',
    chapterOrderIndex: 1,
    chapterTitle: '第一章',
    totalChapters: 6,
    chapterProgress: 0.25,
    overallProgress: 0.25,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}
