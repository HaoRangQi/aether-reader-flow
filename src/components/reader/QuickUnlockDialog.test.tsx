import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickUnlockDialog } from './QuickUnlockDialog';
import type { ModelService } from '@/types/domain';

const vault = vi.hoisted(() => ({
  unlocked: false,
  unlock: vi.fn(),
  encryptForStorage: vi.fn(),
  getApiKey: vi.fn(),
}));

const modelRepo = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

const configService = vi.hoisted(() => ({
  getTaskRouting: vi.fn(),
  setTaskRouting: vi.fn(),
}));

const existingService: ModelService = {
  id: 'default-anthropic',
  name: 'Anthropic Claude',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKeyCipher: 'encrypted-key',
  enabled: true,
  enabledModels: ['claude-sonnet-4-6'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

vi.mock('@/lib/ai-service-client', () => ({
  getVault: () => vault,
}));

vi.mock('@/adapters/storage/IndexedDBModelServiceRepo', () => ({
  IndexedDBModelServiceRepo: vi.fn(function IndexedDBModelServiceRepo() {
    return modelRepo;
  }),
}));

vi.mock('@/adapters/storage/IndexedDBConfigRepo', () => ({
  IndexedDBConfigRepo: vi.fn(function IndexedDBConfigRepo() {
    return {};
  }),
}));

vi.mock('@/services/ConfigService', () => ({
  ConfigService: vi.fn(function ConfigService() {
    return configService;
  }),
}));

describe('QuickUnlockDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vault.unlocked = false;
    modelRepo.get.mockResolvedValue(null);
    modelRepo.list.mockResolvedValue([]);
    modelRepo.create.mockResolvedValue(undefined);
    modelRepo.update.mockResolvedValue(undefined);
    configService.getTaskRouting.mockResolvedValue({
      translate: { serviceId: 'default-anthropic', modelId: 'claude-haiku-4-5' },
      explain: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
      verify: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
      summarize: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
      chat: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
    });
    configService.setTaskRouting.mockResolvedValue(undefined);
  });

  it('announces validation errors as an alert', async () => {
    const user = userEvent.setup();
    render(<QuickUnlockDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存并解锁' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入主密码');
    expect(screen.getByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
  });

  it('does not close from the backdrop while saving credentials', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveEncrypt: (value: string) => void = () => undefined;
    vault.encryptForStorage.mockReturnValue(
      new Promise<string>(resolve => {
        resolveEncrypt = resolve;
      }),
    );
    render(<QuickUnlockDialog open onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'master-password');
    await user.type(screen.getByLabelText('Anthropic API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '保存并解锁' }));

    expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
    expect(screen.getByLabelText('主密码')).toBeDisabled();
    expect(screen.getByLabelText('Anthropic API Key')).toBeDisabled();
    expect(screen.getByRole('button', { name: '显示' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭解锁弹窗' })).toBeDisabled();
    await user.click(screen.getByRole('dialog', { name: '配置 AI（首次）' }));

    expect(onClose).not.toHaveBeenCalled();

    resolveEncrypt('encrypted-key');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('announces existing-service unlock failures and restores the unlock button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    modelRepo.list.mockResolvedValue([existingService]);
    vault.getApiKey.mockRejectedValueOnce(new Error('主密码错误'));
    render(<QuickUnlockDialog open onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: '解锁 AI' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Anthropic API Key')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '解锁' }));

    expect(vault.getApiKey).toHaveBeenCalledWith('default-anthropic');
    expect(await screen.findByRole('alert')).toHaveTextContent('主密码错误');
    expect(screen.getByRole('button', { name: '解锁' })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('unlocks the routed configured service without asking for the API key again', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    const routedService: ModelService = {
      ...existingService,
      id: 'custom-openai',
      name: '自定义 OpenAI',
      protocol: 'openai',
      baseUrl: 'https://example.com/v1',
    };
    modelRepo.list.mockResolvedValue([existingService, routedService]);
    configService.getTaskRouting.mockResolvedValue({
      translate: { serviceId: 'default-anthropic', modelId: 'claude-haiku-4-5' },
      explain: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
      verify: { serviceId: 'custom-openai', modelId: 'gpt-4o' },
      summarize: { serviceId: 'default-anthropic', modelId: 'claude-sonnet-4-6' },
      chat: { serviceId: 'custom-openai', modelId: 'gpt-4o' },
    });
    vault.getApiKey.mockResolvedValueOnce('sk-test');

    render(<QuickUnlockDialog open onClose={onClose} onUnlocked={onUnlocked} />);

    expect(await screen.findByRole('dialog', { name: '解锁 AI' })).toBeInTheDocument();
    expect(screen.getByText('请输入主密码以解锁已保存的模型服务密钥：自定义 OpenAI。')).toBeInTheDocument();
    expect(screen.queryByLabelText('Anthropic API Key')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('主密码'), 'master-password');
    await user.click(screen.getByRole('button', { name: '解锁' }));

    expect(vault.unlock).toHaveBeenCalledWith('master-password');
    expect(vault.getApiKey).toHaveBeenCalledWith('custom-openai');
    expect(vault.encryptForStorage).not.toHaveBeenCalled();
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits the unlock form when pressing Enter in the password field', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    modelRepo.list.mockResolvedValue([existingService]);
    vault.getApiKey.mockResolvedValueOnce('sk-test');

    render(<QuickUnlockDialog open onClose={onClose} onUnlocked={onUnlocked} />);

    expect(await screen.findByRole('dialog', { name: '解锁 AI' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'master-password{Enter}');

    expect(vault.unlock).toHaveBeenCalledWith('master-password');
    expect(vault.getApiKey).toHaveBeenCalledWith('default-anthropic');
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores duplicate submits while saving credentials', async () => {
    const user = userEvent.setup();
    let resolveEncrypt: (value: string) => void = () => undefined;
    vault.encryptForStorage.mockReturnValue(
      new Promise<string>(resolve => {
        resolveEncrypt = resolve;
      }),
    );
    render(<QuickUnlockDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'master-password');
    await user.type(screen.getByLabelText('Anthropic API Key'), 'sk-ant-test');
    await user.dblClick(screen.getByRole('button', { name: '保存并解锁' }));

    expect(vault.unlock).toHaveBeenCalledTimes(1);
    expect(vault.encryptForStorage).toHaveBeenCalledTimes(1);
    expect(modelRepo.create).not.toHaveBeenCalled();

    resolveEncrypt('encrypted-key');
    await waitFor(() => expect(modelRepo.create).toHaveBeenCalledTimes(1));
  });

  it('keeps entered credentials visible after a save failure', async () => {
    const user = userEvent.setup();
    modelRepo.create.mockRejectedValueOnce(new Error('写入失败'));
    render(<QuickUnlockDialog open onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'master-password');
    await user.type(screen.getByLabelText('Anthropic API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '保存并解锁' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('写入失败');
    expect(screen.getByLabelText('主密码')).toHaveValue('master-password');
    expect(screen.getByLabelText('Anthropic API Key')).toHaveValue('sk-ant-test');
    expect(screen.getByRole('button', { name: '保存并解锁' })).toBeEnabled();
  });

  it('clears local credential state before closing after a successful setup', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    render(<QuickUnlockDialog open onClose={onClose} onUnlocked={onUnlocked} />);

    expect(await screen.findByRole('dialog', { name: '配置 AI（首次）' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('主密码'), 'master-password');
    await user.type(screen.getByLabelText('Anthropic API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '显示' }));
    await user.click(screen.getByRole('button', { name: '保存并解锁' }));

    await waitFor(() => expect(screen.getByLabelText('主密码')).toHaveValue(''));
    expect(screen.getByLabelText('Anthropic API Key')).toHaveValue('');
    expect(screen.getByRole('button', { name: '显示' })).toBeInTheDocument();
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports initialization failures and allows retrying or closing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    modelRepo.list
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce([existingService]);
    render(<QuickUnlockDialog open onClose={onClose} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '读取本地 AI 配置失败：IndexedDB unavailable',
    );
    expect(screen.getByRole('dialog', { name: '读取 AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并解锁' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '重试读取配置' }));

    expect(await screen.findByRole('dialog', { name: '解锁 AI' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭解锁弹窗' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-closes when the vault is already unlocked for an existing service', async () => {
    const onClose = vi.fn();
    const onUnlocked = vi.fn();
    vault.unlocked = true;
    modelRepo.list.mockResolvedValue([existingService]);

    render(<QuickUnlockDialog open onClose={onClose} onUnlocked={onUnlocked} />);

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
