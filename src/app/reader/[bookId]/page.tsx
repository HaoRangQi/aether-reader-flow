/**
 * Reader page. Server Component shell — passes `bookId` to client ReaderView.
 * Next 16 requires awaiting `params` (async Server Components).
 */
import { ReaderView } from '@/components/reader/ReaderView';

interface Params {
  params: Promise<{ bookId: string }>;
}

export default async function ReaderPage({ params }: Params) {
  const { bookId } = await params;
  return <ReaderView bookId={bookId} />;
}
