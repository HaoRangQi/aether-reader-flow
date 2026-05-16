/**
 * Library home page. Renders a client-side BookList because all data lives
 * in IndexedDB (browser-only). The page itself is intentionally a thin
 * Server Component shell.
 */
import { BookList } from '@/components/library/BookList';

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <BookList />
    </main>
  );
}
