/**
 * @fileoverview PDF.js wrapper.
 *
 * PDF.js needs a Web Worker to run efficiently. We bundled the worker into
 * `public/pdf.worker.min.mjs` (see T1.8). On client-side, `configurePdfWorker()`
 * must run once before any `getDocument()` call.
 *
 * In tests we mock this module entirely, so the worker is never loaded.
 */
import * as pdfjs from 'pdfjs-dist';

let configured = false;

/**
 * Idempotent worker setup. Safe to call from anywhere before `pdfjs.getDocument`.
 */
export function configurePdfWorker(): void {
  if (configured) return;
  if (pdfjs.GlobalWorkerOptions.workerSrc.trim()) {
    configured = true;
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  configured = true;
}

export { pdfjs };
