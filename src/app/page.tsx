/**
 * Library home page. Renders a client-side BookList because all data lives
 * in IndexedDB (browser-only).
 */
import Link from 'next/link';
import { BookList } from '@/components/library/BookList';
import { Settings } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-end mb-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <Settings size={14} /> 设置
        </Link>
      </div>
      <BookList />
    </main>
  );
}
