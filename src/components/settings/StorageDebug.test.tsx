import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageDebug } from './StorageDebug';

const storageDebug = vi.hoisted(() => ({
  checkStorageHealth: vi.fn(),
  requestPersistence: vi.fn(),
}));

const localBackup = vi.hoisted(() => ({
  exportLocalBackupBlob: vi.fn(),
  prepareLocalBackupText: vi.fn(),
  restorePreparedLocalBackup: vi.fn(),
}));

vi.mock('@/lib/storage-debug', () => storageDebug);

vi.mock('@/lib/local-backup', () => localBackup);

const healthyStorage = {
  available: true,
  persistent: true,
  quota: { usage: 2 * 1024 * 1024, quota: 50 * 1024 * 1024 },
  databases: ['aether-reader-flow'],
};

const preparedBackup = {
  backup: {
    app: 'aether-reader-flow',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tables: {},
  },
  restoredTables: {},
  preview: {
    exportedAt: new Date('2026-01-01T00:00:00.000Z'),
    books: 2,
    annotations: 3,
    timelineEntries: 4,
    modelServices: 1,
  },
};

describe('StorageDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('navigator', {
      storage: {
        persist: vi.fn(),
      },
    });
    storageDebug.checkStorageHealth.mockResolvedValue(healthyStorage);
    storageDebug.requestPersistence.mockResolvedValue(true);
    localBackup.exportLocalBackupBlob.mockResolvedValue(
      new Blob(['{}'], { type: 'application/json' }),
    );
    localBackup.prepareLocalBackupText.mockResolvedValue(preparedBackup);
    localBackup.restorePreparedLocalBackup.mockResolvedValue(undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:backup'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('exports a downloadable JSON backup', async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StorageDebug />);

    await user.click(await screen.findByRole('button', { name: '导出 JSON 备份' }));

    expect(localBackup.exportLocalBackupBlob).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });

  it('announces backup export failures and restores the export button', async () => {
    const user = userEvent.setup();
    localBackup.exportLocalBackupBlob.mockRejectedValueOnce(
      new Error('IndexedDB 导出失败'),
    );
    render(<StorageDebug />);

    await user.click(await screen.findByRole('button', { name: '导出 JSON 备份' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB 导出失败');
    expect(screen.getByRole('button', { name: '导出 JSON 备份' })).toBeEnabled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('previews a selected backup before destructive restore', async () => {
    const user = userEvent.setup();
    render(<StorageDebug />);

    await uploadBackupFile(user, '{"app":"aether-reader-flow"}');

    expect(localBackup.prepareLocalBackupText).toHaveBeenCalledWith('{"app":"aether-reader-flow"}');
    expect(await screen.findByText('备份预览')).toBeInTheDocument();
    expect(screen.getByText('书籍：2 本')).toBeInTheDocument();
    expect(screen.getByText('批注：3 条')).toBeInTheDocument();
    expect(screen.getByText('时间轴：4 条')).toBeInTheDocument();
    expect(screen.getByText('模型服务：1 个')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我已备份当前数据，覆盖恢复' })).toBeInTheDocument();
  });

  it('disables backup actions while reading and validating an imported file', async () => {
    const user = userEvent.setup();
    const prepare = deferred<typeof preparedBackup>();
    localBackup.prepareLocalBackupText.mockReturnValueOnce(prepare.promise);
    render(<StorageDebug />);

    const fileInput = await findBackupFileInput();
    await user.upload(
      fileInput,
      new File(['{"app":"aether-reader-flow"}'], 'backup.json', {
        type: 'application/json',
      }),
    );

    await waitFor(() => expect(localBackup.prepareLocalBackupText).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '导出 JSON 备份' })).toBeDisabled();
    expect(fileInput).toBeDisabled();
    expect(screen.getByText('读取中…')).toBeInTheDocument();

    prepare.resolve(preparedBackup);

    expect(await screen.findByText('备份预览')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出 JSON 备份' })).toBeEnabled();
    expect(await findBackupFileInput()).toBeEnabled();
  });

  it('lets users cancel a prepared restore without touching stored data', async () => {
    const user = userEvent.setup();
    render(<StorageDebug />);

    await uploadBackupFile(user, '{"app":"aether-reader-flow"}');
    await user.click(await screen.findByRole('button', { name: '取消' }));

    expect(screen.queryByText('备份预览')).not.toBeInTheDocument();
    expect(localBackup.restorePreparedLocalBackup).not.toHaveBeenCalled();
  });

  it('shows invalid backup errors without enabling restore', async () => {
    const user = userEvent.setup();
    localBackup.prepareLocalBackupText.mockRejectedValueOnce(new Error('备份文件格式无效。'));
    render(<StorageDebug />);

    await uploadBackupFile(user, 'not-json');

    expect(await screen.findByRole('alert')).toHaveTextContent('备份文件格式无效。');
    expect(screen.queryByRole('button', { name: '我已备份当前数据，覆盖恢复' })).not.toBeInTheDocument();
  });

  it('restores only after explicit confirmation', async () => {
    const user = userEvent.setup();
    render(<StorageDebug />);

    await uploadBackupFile(user, '{"app":"aether-reader-flow"}');
    await user.click(await screen.findByRole('button', { name: '我已备份当前数据，覆盖恢复' }));

    expect(localBackup.restorePreparedLocalBackup).toHaveBeenCalledWith(preparedBackup);
    expect(await screen.findByRole('status')).toHaveTextContent('恢复完成');
  });

  it('ignores duplicate restore confirmation while a restore is already running', async () => {
    const user = userEvent.setup();
    const restore = deferred<void>();
    localBackup.restorePreparedLocalBackup.mockReturnValueOnce(restore.promise);
    render(<StorageDebug />);

    await uploadBackupFile(user, '{"app":"aether-reader-flow"}');
    const restoreButton = await screen.findByRole('button', {
      name: '我已备份当前数据，覆盖恢复',
    });
    fireEvent.click(restoreButton);
    fireEvent.click(restoreButton);

    expect(localBackup.restorePreparedLocalBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '恢复中…' })).toBeDisabled();

    restore.resolve();

    expect(await screen.findByRole('status')).toHaveTextContent('恢复完成');
  });

  it('announces restore failures while keeping the prepared backup available', async () => {
    const user = userEvent.setup();
    localBackup.restorePreparedLocalBackup.mockRejectedValueOnce(
      new Error('IndexedDB 写入失败'),
    );
    render(<StorageDebug />);

    await uploadBackupFile(user, '{"app":"aether-reader-flow"}');
    await user.click(await screen.findByRole('button', { name: '我已备份当前数据，覆盖恢复' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB 写入失败');
    expect(screen.getByText('备份预览')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '我已备份当前数据，覆盖恢复' }),
    ).toBeEnabled();
  });

  it('announces persistence request failures and restores the request button', async () => {
    const user = userEvent.setup();
    storageDebug.checkStorageHealth.mockResolvedValueOnce({
      ...healthyStorage,
      persistent: false,
    });
    storageDebug.requestPersistence.mockRejectedValueOnce(
      new Error('浏览器持久化授权失败'),
    );
    render(<StorageDebug />);

    await user.click(await screen.findByRole('button', { name: '请求持久化' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '持久化请求失败：浏览器持久化授权失败',
    );
    expect(screen.getByRole('button', { name: '请求持久化' })).toBeEnabled();
  });
});

async function uploadBackupFile(user: ReturnType<typeof userEvent.setup>, text: string) {
  await screen.findByRole('button', { name: '导出 JSON 备份' });
  const input = await findBackupFileInput();
  const file = new File([text], 'backup.json', { type: 'application/json' });
  await user.upload(input, file);
  await waitFor(() => expect(localBackup.prepareLocalBackupText).toHaveBeenCalled());
}

async function findBackupFileInput() {
  await screen.findByRole('button', { name: '导出 JSON 备份' });
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Backup file input not found.');
  }
  return input;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
