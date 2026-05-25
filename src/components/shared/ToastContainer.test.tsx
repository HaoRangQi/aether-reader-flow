import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore, type ToastVariant } from '@/stores/toastStore';
import { ToastContainer } from './ToastContainer';

describe('ToastContainer', () => {
  const dismissToast = useToastStore.getState().dismiss;

  beforeEach(() => {
    useToastStore.setState({ toasts: [], dismiss: dismissToast });
  });

  it('renders non-danger toasts as polite status messages', () => {
    useToastStore.setState({
      toasts: [
        { id: 'success-1', message: '保存成功', variant: 'success' },
        { id: 'warning-1', message: '预算即将用完', variant: 'warning' },
      ],
    });

    render(<ToastContainer />);

    const region = screen.getByRole('region', { name: '通知' });
    expect(region).toContainElement(screen.getByText('保存成功'));
    expect(region).toContainElement(screen.getByText('预算即将用完'));
    expect(screen.getByText('保存成功').closest('[role="status"]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByText('预算即将用完').closest('[role="status"]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('renders danger toasts as assertive alerts', () => {
    useToastStore.setState({
      toasts: [{ id: 'danger-1', message: '保存失败，请重试', variant: 'danger' }],
    });

    render(<ToastContainer />);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('falls back to info styling for unknown variants', () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'unknown-variant',
          message: '来自旧缓存的通知',
          variant: 'legacy' as ToastVariant,
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('来自旧缓存的通知')).toHaveClass('text-info');
  });

  it('truncates long dismiss labels predictably', () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'long-toast',
          message: 'abcdefghijklmnopqrstuvwxyz has extra details',
          variant: 'info',
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByText('abcdefghijklmnopqrstuvwxyz has extra details')).toHaveClass(
      'break-words',
    );
    expect(
      screen.getByRole('button', { name: '关闭通知：abcdefghijklmnopqrstuvwx…' }),
    ).toBeInTheDocument();
  });

  it('keeps whitespace-only toasts perceivable', () => {
    useToastStore.setState({
      toasts: [{ id: 'blank-toast', message: '   \n\t  ', variant: 'info' }],
    });

    render(<ToastContainer />);

    expect(screen.getByRole('status')).toHaveTextContent('通知');
    expect(screen.getByRole('button', { name: '关闭通知：通知' })).toBeInTheDocument();
  });

  it('labels dismiss buttons with toast message snippets', async () => {
    const user = userEvent.setup();
    useToastStore.setState({
      toasts: [{ id: 'toast-1', message: '导出完成，可以下载文件', variant: 'success' }],
    });

    render(<ToastContainer />);

    await user.click(screen.getByRole('button', { name: '关闭通知：导出完成，可以下载文件' }));

    expect(screen.queryByText('导出完成，可以下载文件')).not.toBeInTheDocument();
  });

  it('tolerates repeated dismiss attempts for the same toast', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn((id: string) =>
      useToastStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
    );
    useToastStore.setState({
      toasts: [{ id: 'toast-1', message: '同步完成', variant: 'success' }],
      dismiss,
    });

    const { rerender } = render(<ToastContainer />);
    await user.click(screen.getByRole('button', { name: '关闭通知：同步完成' }));

    act(() => {
      useToastStore.getState().dismiss('toast-1');
    });
    rerender(<ToastContainer />);

    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('同步完成')).not.toBeInTheDocument();
  });
});
