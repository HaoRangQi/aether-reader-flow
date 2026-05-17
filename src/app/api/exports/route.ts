/**
 * /api/exports — reserved for future server-side export rendering (e.g.,
 * for generating PDFs that need a headless browser). The MVP runs export
 * entirely in the browser since IndexedDB lives there.
 */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Export runs client-side (IndexedDB is browser-only).' },
    { status: 501 },
  );
}
