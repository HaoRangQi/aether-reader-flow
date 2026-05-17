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

export const useToastStore = create<ToastState>(set => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const id = `t-${Date.now()}-${Math.random()}`;
    set(s => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
