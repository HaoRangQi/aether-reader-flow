import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerOptions = vi.hoisted(() => ({
  workerSrc: '',
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: workerOptions,
}));

describe('configurePdfWorker', () => {
  beforeEach(() => {
    workerOptions.workerSrc = '';
    vi.resetModules();
  });

  it('sets the bundled worker when no worker source is configured', async () => {
    const { configurePdfWorker, pdfjs } = await import('./pdf-utils');

    configurePdfWorker();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.min.mjs');
  });

  it('does not overwrite an externally configured worker source', async () => {
    workerOptions.workerSrc = '/custom/pdf.worker.mjs';
    const { configurePdfWorker, pdfjs } = await import('./pdf-utils');

    configurePdfWorker();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/custom/pdf.worker.mjs');
  });

  it('replaces blank worker sources with the bundled worker', async () => {
    workerOptions.workerSrc = '   ';
    const { configurePdfWorker, pdfjs } = await import('./pdf-utils');

    configurePdfWorker();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.min.mjs');
  });

  it('is idempotent after the first configuration', async () => {
    const { configurePdfWorker, pdfjs } = await import('./pdf-utils');

    configurePdfWorker();
    pdfjs.GlobalWorkerOptions.workerSrc = '/changed-after-config.mjs';
    configurePdfWorker();

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/changed-after-config.mjs');
  });
});
