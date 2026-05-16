'use client';

/**
 * Empty-library state. Big call to action to upload the first PDF.
 * The illustration slot is reserved for P5 polish; we ship text-only here.
 */
export function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="text-2xl font-serif text-foreground mb-3">
        书架还是空的
      </div>
      <div className="text-sm text-muted mb-8 max-w-md">
        上传你的第一本 PDF，让 AI 陪你读懂。每一次提问、每一次验证，都会被记录到你的思考文档里。
      </div>
      <button
        onClick={onUpload}
        className="rounded-md bg-accent text-white px-6 py-2.5 text-sm hover:bg-[var(--color-accent-hover)] transition"
      >
        上传 PDF
      </button>
    </div>
  );
}
