/**
 * Reserved API route for future server-side book upload (e.g. when we need
 * server-side rendering for large PDFs or want to move parsing off the
 * main thread of the browser).
 *
 * In MVP, PDF parsing runs entirely in the browser (`UploadDialog.tsx` calls
 * `BookService.upload` which writes IndexedDB). This route returns 501 so
 * that an accidental fetch to it is loudly rejected.
 */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Client-side upload preferred in MVP; this route is reserved.' },
    { status: 501 },
  );
}
