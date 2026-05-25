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

const TOAST_A11Y: Record<ToastVariant, { role: 'status' | 'alert'; live: 'polite' | 'assertive' }> = {
  info: { role: 'status', live: 'polite' },
  success: { role: 'status', live: 'polite' },
  warning: { role: 'status', live: 'polite' },
  danger: { role: 'alert', live: 'assertive' },
};

const DISMISS_LABEL_MESSAGE_LIMIT = 24;
const EMPTY_TOAST_MESSAGE = '通知';
const DEFAULT_TOAST_VARIANT: ToastVariant = 'info';

function getToastMessage(message: string) {
  const normalizedMessage = message.trim().replace(/\s+/g, ' ');
  return normalizedMessage || EMPTY_TOAST_MESSAGE;
}

function getToastVariant(variant: ToastVariant) {
  return Object.prototype.hasOwnProperty.call(VARIANT_CLASS, variant)
    ? variant
    : DEFAULT_TOAST_VARIANT;
}

function getDismissLabel(message: string) {
  const normalizedMessage = getToastMessage(message);
  const chars = Array.from(normalizedMessage);
  const snippet =
    chars.length > DISMISS_LABEL_MESSAGE_LIMIT
      ? `${chars.slice(0, DISMISS_LABEL_MESSAGE_LIMIT).join('')}…`
      : normalizedMessage;

  return `关闭通知：${snippet}`;
}

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
      role="region"
      aria-label="通知"
    >
      {toasts.map(t => {
        const variant = getToastVariant(t.variant);
        const a11y = TOAST_A11Y[variant];
        const message = getToastMessage(t.message);

        return (
          <GlassPanel
            key={t.id}
            className="px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-[calc(100vw-3rem)] sm:max-w-md"
            role={a11y.role}
            aria-live={a11y.live}
          >
            <span className={clsx('min-w-0 flex-1 break-words text-sm', VARIANT_CLASS[variant])}>
              {message}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-auto text-muted hover:text-foreground"
              aria-label={getDismissLabel(message)}
            >
              <X size={14} />
            </button>
          </GlassPanel>
        );
      })}
    </div>
  );
}
