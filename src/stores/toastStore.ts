'use client';

/**
 * @fileoverview Toast notification store.
 *
 * Minimal: push() enqueues a toast that auto-dismisses after 4s; dismiss()
 * removes a specific id. Render is handled by `<ToastContainer />`.
 */
import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  push: (msg: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

const TOAST_VARIANTS = new Set<ToastVariant>(['info', 'success', 'warning', 'danger']);

function normalizeToastMessage(message: string) {
  return typeof message === 'string' ? message.trim() : '';
}

function normalizeToastVariant(variant: ToastVariant) {
  return TOAST_VARIANTS.has(variant) ? variant : 'info';
}

export const useToastStore = create<ToastState>(set => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const normalizedMessage = normalizeToastMessage(message);
    if (!normalizedMessage) return;

    const id = `t-${Date.now()}-${Math.random()}`;
    set(s => ({
      toasts: [
        ...s.toasts,
        { id, message: normalizedMessage, variant: normalizeToastVariant(variant) },
      ],
    }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
