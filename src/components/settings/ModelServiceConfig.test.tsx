import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelService } from '@/types/domain';
import { ModelServiceConfig } from './ModelServiceConfig';

const repo = vi.hoisted(() => ({
  list: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/adapters/storage/IndexedDBModelServiceRepo', () => ({
  IndexedDBModelServiceRepo: vi.fn(function IndexedDBModelServiceRepo() {
    return repo;
  }),
}));

vi.mock('./ModelServiceForm', () => ({
  ModelServiceForm: ({ existingId, onClose }: { existingId?: string; onClose: () => void }) => (
    <div role="dialog" aria-label={existingId ? `编辑 ${existingId}` : '添加模型服务'}>
      <button type="button" onClick={onClose}>
        关闭表单
      </button>
    </div>
  ),
}));

const service = (patch: Partial<ModelService> = {}): ModelService => ({
  id: 'svc-openai',
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyCipher: 'fake-cipher',
  enabled: true,
  enabledModels: ['gpt-4o'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

describe('ModelServiceConfig', () => {
  beforeEach(() => {
    repo.list.mockReset();
    repo.delete.mockReset();
    vi.unstubAllGlobals();
  });

  it('announces load failures and lets the user retry', async () => {
    const user = userEvent.setup();
    repo.list
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce([service()]);

    render(<ModelServiceConfig />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '模型服务列表加载失败：IndexedDB unavailable。请重试。',
    );
    expect(screen.queryByText('还没配置任何服务，从下方预置选择一个开始')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重试加载' }));

    expect(await screen.findByRole('group', { name: '模型服务 OpenAI' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it('keeps the service when the user cancels delete confirmation', async () => {
    const user = userEvent.setup();
    repo.list.mockResolvedValue([service()]);
    vi.stubGlobal('confirm', vi.fn(() => false));

    render(<ModelServiceConfig />);

    await user.click(await screen.findByRole('button', { name: '删除' }));

    expect(repo.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '模型服务 OpenAI' })).toBeInTheDocument();
  });

  it('keeps the service card and edit context when delete fails', async () => {
    const user = userEvent.setup();
    repo.list.mockResolvedValue([service()]);
    repo.delete.mockRejectedValueOnce(new Error('Delete failed'));
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<ModelServiceConfig />);

    await user.click(await screen.findByRole('button', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 svc-openai' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '删除模型服务失败：Delete failed。已保留当前服务和编辑内容。',
    );
    expect(within(screen.getByRole('group', { name: '模型服务 OpenAI' })).getByText('OpenAI'))
      .toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '编辑 svc-openai' })).toBeInTheDocument();
  });

  it('refreshes the service list after a successful delete', async () => {
    const user = userEvent.setup();
    repo.list.mockResolvedValueOnce([service()]).mockResolvedValueOnce([]);
    repo.delete.mockResolvedValueOnce(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<ModelServiceConfig />);

    await user.click(await screen.findByRole('button', { name: '删除' }));

    await waitFor(() => expect(repo.delete).toHaveBeenCalledWith('svc-openai'));
    expect(await screen.findByText('还没配置任何服务，从下方预置选择一个开始')).toBeInTheDocument();
    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it('shows a visible error when refresh fails after delete succeeds', async () => {
    const user = userEvent.setup();
    repo.list.mockResolvedValueOnce([service()]).mockRejectedValueOnce(new Error('Refresh failed'));
    repo.delete.mockResolvedValueOnce(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<ModelServiceConfig />);

    await user.click(await screen.findByRole('button', { name: '删除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '模型服务已删除，但刷新列表失败：Refresh failed。请重试。',
    );
    expect(screen.getByRole('group', { name: '模型服务 OpenAI' })).toBeInTheDocument();
    expect(repo.list).toHaveBeenCalledTimes(2);
  });
});
