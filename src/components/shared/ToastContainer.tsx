'use client';

/**
 * ToastContainer — renders the current toast queue at bottom-right.
 * Mounted once in the root layout.
 */
import { useToastStore, type ToastVariant } from '@/stores/toastStore';
import { GlassPanel } from './GlassPanel';
import { X } from 'lucide-react';
import clsx from 'clsx';

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map(t => (
        <GlassPanel
          key={t.id}
          className="px-4 py-3 flex items-center gap-3 min-w-[260px]"
        >
          <span className={clsx('text-sm', VARIANT_CLASS[t.variant])}>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-auto text-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </GlassPanel>
      ))}
    </div>
  );
}
