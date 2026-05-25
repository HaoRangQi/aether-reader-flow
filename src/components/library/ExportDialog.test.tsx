import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { IndexedDBChapterRepo } from '@/adapters/storage/IndexedDBChapterRepo';
import { ExportService } from '@/services/ExportService';
import { ExportDialog } from './ExportDialog';

describe('ExportDialog', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:export'),
      revokeObjectURL: vi.fn(),
    });
    await resetDb();
    await new IndexedDBBookRepo().create({
      id: 'book-1',
      title: '测试书籍',
      fileName: 'book.pdf',
      totalPages: 20,
      totalChapters: 2,
      language: 'zh',
    });
    await new IndexedDBChapterRepo().bulkCreate([
      {
        id: 'chapter-1',
        bookId: 'book-1',
        orderIndex: 1,
        title: '开篇',
        startPage: 1,
        endPage: 10,
        content: '',
        wordCount: 0,
      },
      {
        id: 'chapter-2',
        bookId: 'book-1',
        orderIndex: 2,
        title: '方法',
        startPage: 11,
        endPage: 20,
        content: '',
        wordCount: 0,
      },
    ]);
  });

  it('names the dialog and exposes the selected export format and template', async () => {
    render(<ExportDialog bookId="book-1" open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '导出思考文档' })).toHaveAccessibleDescription(
        /完整阅读报告/,
      );
    });

    const formatGroup = screen.getByRole('group', { name: '导出格式' });
    expect(within(formatGroup).getByRole('button', { name: 'Markdown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(formatGroup).getByRole('button', { name: 'HTML' }));

    expect(within(formatGroup).getByRole('button', { name: 'HTML' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const templateGroup = screen.getByRole('group', { name: '导出模板' });
    expect(within(templateGroup).getByRole('button', { name: '完整阅读报告' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(templateGroup).getByRole('button', { name: '仅验证结果' }));

    expect(within(templateGroup).getByRole('button', { name: '仅验证结果' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('仅验证结果');
  });

  it('disables export while chapters are loading', () => {
    vi.spyOn(IndexedDBChapterRepo.prototype, 'listByBook').mockReturnValue(
      new Promise(() => {}),
    );

    render(<ExportDialog bookId="book-1" open onClose={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载章节');
    expect(screen.getByRole('button', { name: '导出' })).toBeDisabled();
  });

  it('announces chapter loading failures and blocks export', async () => {
    vi.spyOn(IndexedDBChapterRepo.prototype, 'listByBook').mockRejectedValueOnce(
      new Error('IndexedDB 不可用'),
    );

    render(<ExportDialog bookId="book-1" open onClose={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '章节列表加载失败：IndexedDB 不可用',
    );
    expect(screen.getByRole('button', { name: '导出' })).toBeDisabled();
  });

  it('announces empty chapter selection and disables export', async () => {
    const user = userEvent.setup();
    render(<ExportDialog bookId="book-1" open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('全部章节')).toBeChecked());
    await user.click(screen.getByLabelText('全部章节'));

    const chapterGroup = screen.getByRole('group', { name: '选择要导出的章节' });
    await user.click(within(chapterGroup).getByLabelText(/开篇/));
    await user.click(within(chapterGroup).getByLabelText(/方法/));

    expect(screen.getByRole('status')).toHaveTextContent('请至少选择一个章节');
    expect(screen.getByRole('button', { name: '导出' })).toBeDisabled();
  });

  it('shows export failures, restores the button, and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let rejectExport!: (error: Error) => void;
    const exportPromise = new Promise<string>((_, reject) => {
      rejectExport = reject;
    });
    const toMarkdown = vi
      .spyOn(ExportService.prototype, 'toMarkdown')
      .mockReturnValue(exportPromise);

    render(<ExportDialog bookId="book-1" open onClose={onClose} />);

    await waitFor(() => expect(screen.getByLabelText('全部章节')).toBeChecked());
    await user.click(screen.getByRole('button', { name: '导出' }));

    expect(toMarkdown).toHaveBeenCalledWith('book-1', { template: 'full-report' });
    expect(screen.getByRole('button', { name: '生成中…' })).toBeDisabled();

    rejectExport(new Error('导出失败，请稍后重试。'));

    expect(await screen.findByRole('alert')).toHaveTextContent('导出失败，请稍后重试。');
    expect(screen.getByRole('button', { name: '导出' })).toBeEnabled();
    expect(screen.getByRole('dialog', { name: '导出思考文档' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('downloads markdown export and closes after a successful export', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const toMarkdown = vi
      .spyOn(ExportService.prototype, 'toMarkdown')
      .mockResolvedValue('# 测试导出');

    render(<ExportDialog bookId="book-1" open onClose={onClose} />);

    await waitFor(() => expect(screen.getByLabelText('全部章节')).toBeChecked());
    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toMarkdown).toHaveBeenCalledWith('book-1', { template: 'full-report' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });
});
