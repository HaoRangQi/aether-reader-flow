import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@/stores/configStore';
import { UploadDialog } from './UploadDialog';

const uploadMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/BookService', () => ({
  BookService: vi.fn(() => ({
    upload: uploadMock,
  })),
  detectFormat: (file: File, fileName: string) => {
    const name = fileName.toLowerCase();
    if (file.type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    if (file.type.includes('epub') || name.endsWith('.epub')) return 'epub';
    if (file.type.startsWith('text/plain') || name.endsWith('.txt')) return 'txt';
    return null;
  },
}));

const initialConfigState = useConfigStore.getState();

describe('UploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
    });
    uploadMock.mockResolvedValue({ id: 'book-1' });
  });

  it('keeps the dialog open and reports per-file failures when a batch partially succeeds', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    uploadMock
      .mockResolvedValueOnce({ id: 'book-1' })
      .mockRejectedValueOnce(new Error('解析失败'));
    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    await user.upload(fileInput(), [
      new File(['pdf'], 'ok.pdf', { type: 'application/pdf' }),
      new File(['pdf'], 'broken.pdf', { type: 'application/pdf' }),
    ]);

    expect(await screen.findByRole('alert')).toHaveTextContent('部分文件导入失败');
    expect(screen.getByRole('alert')).toHaveTextContent('broken.pdf');
    expect(screen.getByRole('alert')).toHaveTextContent('解析失败');
    expect(screen.getByRole('status')).toHaveTextContent('已导入 1/2 本');
    const progressbar = screen.getByRole('progressbar', { name: '批量上传进度' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '100');
    expect(progressbar).toHaveAttribute(
      'aria-valuetext',
      '批量上传进度：已处理 2/2，100%，失败 1',
    );
    expect(progressbar.closest('[aria-live="polite"]')).toHaveAttribute(
      'aria-label',
      '批量上传进度',
    );
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refreshes the shelf and closes after all selected files import successfully', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    await user.upload(fileInput(), [
      new File(['pdf'], 'first.pdf', { type: 'application/pdf' }),
      new File(['txt'], 'second.txt', { type: 'text/plain' }),
    ]);

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not close from the backdrop while an upload is running', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    uploadMock.mockReturnValueOnce(pending.promise);
    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    await user.upload(fileInput(), new File(['pdf'], 'slow.pdf', { type: 'application/pdf' }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();

    pending.resolve({ id: 'book-1' });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps failed batch context visible and allows retrying with a new selection', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    uploadMock
      .mockRejectedValueOnce(new Error('第一个失败'))
      .mockRejectedValueOnce(new Error('第二个失败'))
      .mockResolvedValueOnce({ id: 'book-3' });
    render(<UploadDialog open onClose={onClose} onUploaded={onUploaded} />);

    await user.upload(fileInput(), [
      new File(['pdf'], 'first.pdf', { type: 'application/pdf' }),
      new File(['txt'], 'second.txt', { type: 'text/plain' }),
    ]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('first.pdf');
    expect(alert).toHaveTextContent('second.txt');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '批量上传进度' })).toHaveAttribute(
      'aria-valuetext',
      '批量上传进度：已处理 2/2，100%，失败 2',
    );
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.upload(fileInput(), new File(['pdf'], 'retry.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(3));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Upload input not found.');
  }
  return input;
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}
