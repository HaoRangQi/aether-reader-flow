import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDb } from '@/adapters/storage/db';
import { IndexedDBBookRepo } from '@/adapters/storage/IndexedDBBookRepo';
import { useConfigStore } from '@/stores/configStore';
import { BookList } from './BookList';
import type { Book } from '@/types/domain';

const initialConfigState = useConfigStore.getState();

describe('BookList', () => {
  beforeEach(async () => {
    await resetDb();
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a recoverable error when the initial library load fails and retries', async () => {
    const user = userEvent.setup();
    await seedBooks();
    vi.spyOn(IndexedDBBookRepo.prototype, 'list').mockRejectedValueOnce(
      new Error('IndexedDB 不可用'),
    );
    render(<BookList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加载书架失败：IndexedDB 不可用',
    );

    await user.click(screen.getByRole('button', { name: '重试加载' }));

    expect(await screen.findByRole('region', { name: '书架筛选与批量操作' })).toBeInTheDocument();
    expect(screen.getByText('当前书')).toBeInTheDocument();
  });

  it('exposes shelf filters and updates the visible result summary', async () => {
    const user = userEvent.setup();
    await seedBooks();
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    expect(within(toolbar).getByRole('status')).toHaveTextContent('1/2');
    expect(screen.getByText('当前书')).toBeInTheDocument();
    expect(screen.queryByText('归档书')).not.toBeInTheDocument();

    const archiveGroup = within(toolbar).getByRole('group', { name: '归档状态筛选' });
    expect(within(archiveGroup).getByRole('button', { name: '当前' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(archiveGroup).getByRole('button', { name: '含归档' }));
    expect(within(toolbar).getByRole('status')).toHaveTextContent('2/2');
    expect(screen.getByText('归档书')).toBeInTheDocument();

    await user.click(within(archiveGroup).getByRole('button', { name: '已归档' }));
    expect(within(toolbar).getByRole('status')).toHaveTextContent('1/2');
    expect(screen.queryByText('当前书')).not.toBeInTheDocument();
    expect(screen.getByText('归档书')).toBeInTheDocument();
  });

  it('disables bulk actions when filters have no matches', async () => {
    const user = userEvent.setup();
    await seedBooks();
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    await user.type(
      within(toolbar).getByRole('textbox', { name: '搜索书名、作者或文件名' }),
      '不存在的书',
    );

    expect(screen.getByText('没有匹配的书籍')).toBeInTheDocument();
    expect(within(toolbar).getByRole('status')).toHaveTextContent('0/2');
    expect(
      within(toolbar).getByRole('button', { name: '导出当前筛选的 0 本书为 Markdown ZIP' }),
    ).toBeDisabled();
    expect(within(toolbar).getByRole('button', { name: '归档当前列表，共 0 本' })).toBeDisabled();
  });

  it('archives the current filtered list without touching non-matching books', async () => {
    const user = userEvent.setup();
    await seedBooks();
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    await user.type(
      within(toolbar).getByRole('textbox', { name: '搜索书名、作者或文件名' }),
      '当前',
    );
    await user.click(within(toolbar).getByRole('button', { name: '归档当前列表，共 1 本' }));

    expect(await getDb().books.get('active-book')).toMatchObject({
      archivedAt: expect.any(Date),
    });
    expect((await getDb().books.get('archived-book'))?.archivedAt).toBeInstanceOf(Date);
    await waitFor(() =>
      expect(within(toolbar).getByRole('status')).toHaveTextContent('0/2'),
    );
  });

  it('announces archive failures and restores the bulk action button', async () => {
    const user = userEvent.setup();
    await seedBooks();
    vi.spyOn(IndexedDBBookRepo.prototype, 'archive').mockRejectedValueOnce(
      new Error('IndexedDB 写入失败'),
    );
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    const archiveButton = within(toolbar).getByRole('button', { name: '归档当前列表，共 1 本' });
    await user.click(archiveButton);

    expect(await within(toolbar).findByRole('alert')).toHaveTextContent(
      '归档失败：IndexedDB 写入失败',
    );
    expect(within(toolbar).getByRole('button', { name: '归档当前列表，共 1 本' })).toBeEnabled();
    expect((await getDb().books.get('active-book'))?.archivedAt).toBeUndefined();
  });

  it('announces restore failures and restores the bulk action button', async () => {
    const user = userEvent.setup();
    await seedBooks();
    vi.spyOn(IndexedDBBookRepo.prototype, 'restore').mockRejectedValueOnce(
      new Error('IndexedDB 写入失败'),
    );
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    const archiveGroup = within(toolbar).getByRole('group', { name: '归档状态筛选' });
    await user.click(within(archiveGroup).getByRole('button', { name: '已归档' }));
    const restoreButton = within(toolbar).getByRole('button', { name: '恢复当前列表，共 1 本' });
    await user.click(restoreButton);

    expect(await within(toolbar).findByRole('alert')).toHaveTextContent(
      '恢复失败：IndexedDB 写入失败',
    );
    expect(within(toolbar).getByRole('button', { name: '恢复当前列表，共 1 本' })).toBeEnabled();
    expect((await getDb().books.get('archived-book'))?.archivedAt).toBeInstanceOf(Date);
  });

  it('announces delete failures and keeps the current filtered card visible', async () => {
    const user = userEvent.setup();
    await seedBooks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.spyOn(IndexedDBBookRepo.prototype, 'delete').mockRejectedValueOnce(
      new Error('删除事务失败'),
    );
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    const search = within(toolbar).getByRole('textbox', { name: '搜索书名、作者或文件名' });
    await user.type(search, '当前');
    await user.click(screen.getByRole('button', { name: '删除书籍' }));

    expect(await within(toolbar).findByRole('alert')).toHaveTextContent(
      '删除失败：删除事务失败',
    );
    expect(search).toHaveValue('当前');
    expect(within(toolbar).getByRole('status')).toHaveTextContent('1/2');
    expect(screen.getByText('当前书')).toBeInTheDocument();
    expect(await getDb().books.get('active-book')).toBeTruthy();
  });

  it('refreshes the current view after a successful delete', async () => {
    const user = userEvent.setup();
    await seedBooks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    await user.click(screen.getByRole('button', { name: '删除书籍' }));

    await waitFor(() => expect(screen.queryByText('当前书')).not.toBeInTheDocument());
    expect(await getDb().books.get('active-book')).toBeUndefined();
    expect(within(toolbar).getByRole('status')).toHaveTextContent('0/1');
  });

  it('guards a single book archive from duplicate clicks while the operation is busy', async () => {
    const user = userEvent.setup();
    await seedBooks();
    const archiveDeferred = deferred<void>();
    const archiveSpy = vi
      .spyOn(IndexedDBBookRepo.prototype, 'archive')
      .mockReturnValue(archiveDeferred.promise);
    render(<BookList />);

    await screen.findByRole('region', { name: '书架筛选与批量操作' });
    const archiveButton = screen.getByRole('button', { name: '归档书籍' });
    await user.dblClick(archiveButton);

    expect(archiveSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '归档书籍' })).not.toBeInTheDocument();

    archiveDeferred.reject(new Error('归档写入失败'));

    expect(await screen.findByRole('alert')).toHaveTextContent('归档失败：归档写入失败');
    expect(screen.getByRole('button', { name: '归档书籍' })).toBeEnabled();
    expect((await getDb().books.get('active-book'))?.archivedAt).toBeUndefined();
  });

  it('guards a single book restore from duplicate clicks and preserves the archived filter on failure', async () => {
    const user = userEvent.setup();
    await seedBooks();
    const restoreDeferred = deferred<void>();
    const restoreSpy = vi
      .spyOn(IndexedDBBookRepo.prototype, 'restore')
      .mockReturnValue(restoreDeferred.promise);
    render(<BookList />);

    const toolbar = await screen.findByRole('region', { name: '书架筛选与批量操作' });
    const archiveGroup = within(toolbar).getByRole('group', { name: '归档状态筛选' });
    await user.click(within(archiveGroup).getByRole('button', { name: '已归档' }));

    const restoreButton = screen.getByRole('button', { name: '恢复书籍' });
    await user.dblClick(restoreButton);

    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '恢复书籍' })).not.toBeInTheDocument();

    restoreDeferred.reject(new Error('恢复写入失败'));

    expect(await within(toolbar).findByRole('alert')).toHaveTextContent(
      '恢复失败：恢复写入失败',
    );
    expect(within(archiveGroup).getByRole('button', { name: '已归档' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(toolbar).getByRole('status')).toHaveTextContent('1/2');
    expect(screen.getByText('归档书')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复书籍' })).toBeEnabled();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function seedBooks() {
  const books: Book[] = [
    {
      id: 'active-book',
      title: '当前书',
      author: '作者甲',
      fileName: 'active.pdf',
      totalPages: 120,
      totalChapters: 6,
      uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
      language: 'zh',
    },
    {
      id: 'archived-book',
      title: '归档书',
      author: '作者乙',
      fileName: 'archived.pdf',
      totalPages: 80,
      totalChapters: 4,
      uploadedAt: new Date('2026-01-02T00:00:00.000Z'),
      archivedAt: new Date('2026-01-03T00:00:00.000Z'),
      language: 'zh',
    },
  ];
  await getDb().books.bulkPut(books);
}
