'use client';

/**
 * NarrowViewportNotice — shows a top banner when window <1024px wide,
 * because the reader's 3-column layout is designed for desktop.
 *
 * Listens to `resize`. Cheap (a single state + boolean comparison).
 */
import { useEffect, useState } from 'react';

export function NarrowViewportNotice() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!narrow) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 text-xs px-4 py-2 text-center backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
        color: 'var(--color-warning)',
      }}
      role="alert"
    >
      建议在桌面端使用以获得最佳阅读体验（当前窗口 &lt; 1024px）
    </div>
  );
}
