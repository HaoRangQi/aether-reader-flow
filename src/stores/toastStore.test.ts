import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore, type ToastVariant } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pushes normalized toast messages and dismisses them by id', () => {
    useToastStore.getState().push('  Saved  ', 'success');

    const [toast] = useToastStore.getState().toasts;
    expect(toast).toMatchObject({ message: 'Saved', variant: 'success' });

    useToastStore.getState().dismiss(toast.id);

    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('ignores blank toast messages without scheduling dismissal', () => {
    useToastStore.getState().push('   ', 'warning');

    expect(useToastStore.getState().toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to info for malformed runtime variants', () => {
    useToastStore.getState().push('Heads up', 'fatal' as ToastVariant);

    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: 'Heads up',
      variant: 'info',
    });
  });

  it('auto-dismisses pushed toasts after the timeout', () => {
    useToastStore.getState().push('Saved', 'success');

    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
