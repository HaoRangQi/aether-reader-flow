import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryStatsPanel } from './LibraryStatsPanel';
import type { LibraryStats } from '@/lib/reading-stats';

function stats(overrides: Partial<LibraryStats> = {}): LibraryStats {
  return {
    totalBooks: 3,
    activeBooks: 2,
    completedBooks: 1,
    averageProgressPercent: 50,
    totalAnnotations: 4,
    totalNotes: 2,
    totalAiInteractions: 5,
    totalAiCostUSD: 0.1234,
    recentBook: {
      bookId: 'book-1',
      title: '边界统计',
      progressPercent: 42,
      updatedAt: new Date('2026-05-24T00:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('LibraryStatsPanel', () => {
  it('bounds invalid imported stats before rendering the dashboard', () => {
    render(
      <LibraryStatsPanel
        stats={stats({
          totalBooks: Number.NaN,
          activeBooks: -2,
          completedBooks: Number.POSITIVE_INFINITY,
          averageProgressPercent: 148.6,
          totalAnnotations: -4,
          totalNotes: Number.NaN,
          totalAiInteractions: Number.POSITIVE_INFINITY,
          totalAiCostUSD: Number.NaN,
          recentBook: {
            bookId: 'book-1',
            title: '异常进度书',
            progressPercent: -20,
            updatedAt: new Date(Number.NaN),
          },
        })}
      />,
    );

    expect(screen.getByText('最近阅读：异常进度书 · 0%')).toBeInTheDocument();
    expect(screen.getByText('平均进度')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0 本在读')).toBeInTheDocument();
    expect(screen.getByText('$0.0000')).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity|-20%|-2/)).not.toBeInTheDocument();
  });
});
