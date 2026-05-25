import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelServiceForm } from './ModelServiceForm';

const vault = vi.hoisted(() => ({
  unlocked: true,
  getApiKey: vi.fn(),
  encryptForStorage: vi.fn(),
  unlock: vi.fn(),
}));

const repo = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/ai-service-client', () => ({
  getVault: () => vault,
}));

vi.mock('@/adapters/storage/IndexedDBModelServiceRepo', () => ({
  IndexedDBModelServiceRepo: vi.fn(() => repo),
}));

const preset = {
  name: 'OpenAI',
  protocol: 'openai' as const,
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  enabledModels: ['gpt-4o'],
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number) {
  return new Response(body, { status });
}

describe('ModelServiceForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vault.unlocked = true;
  });

  it('connects critical fields to accessible names and help text', () => {
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '添加模型服务' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('OpenAI');
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveAccessibleDescription(
      '如 https://api.openai.com/v1，末尾无斜杠',
    );
    expect(screen.getByLabelText('API Key')).toHaveAccessibleDescription(
      '首次创建模型服务必须填写 API Key。',
    );
    expect(screen.getByRole('combobox', { name: '协议' })).toHaveAccessibleDescription(
      '选择 endpoint 使用的模型服务协议。',
    );
    expect(
      screen.getByRole('textbox', { name: '手动添加模型（逗号分隔，保存时合并到启用列表）' }),
    ).toHaveAccessibleDescription('例：gpt-4o, my-custom-model-v2');
  });

  it('shows API JSON errors for model fetch without dumping the raw JSON body', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'provider rejected the API key' }, 401)),
    );
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '拉取模型列表' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '拉取模型列表失败：HTTP 401: provider rejected the API key。已保留当前模型选择，可重试或手动添加模型。',
    );
    expect(alert).not.toHaveTextContent('"error"');
    expect(screen.getByLabelText('API Key')).toHaveValue('sk-test');
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
      'https://api.openai.com/v1',
    );
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(
      screen.getByText('没有可勾选的模型。请在“手动添加模型”中输入模型 id，保存时会合并到启用列表。'),
    ).toHaveAttribute('role', 'status');
  });

  it('bounds non-JSON API error text and redacts the API key', async () => {
    const user = userEvent.setup();
    const longText = `gateway failed sk-secret ${'x'.repeat(260)} tail`;
    vi.stubGlobal('fetch', vi.fn(async () => textResponse(longText, 502)));
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-secret');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    const result = await screen.findByRole('alert');
    expect(result).toHaveTextContent('HTTP 502: gateway failed [redacted]');
    expect(result).toHaveTextContent('…');
    expect(result).not.toHaveTextContent('sk-secret');
    expect(result).not.toHaveTextContent('tail');
  });

  it('shows API JSON errors for connection tests without dumping the raw JSON body', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'model endpoint refused test' }, 400)),
    );
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    const result = await screen.findByRole('alert');
    expect(result).toHaveTextContent('✗ HTTP 400: model endpoint refused test');
    expect(result).not.toHaveTextContent('"error"');
  });

  it('tests an existing service with the stored API key when the key field is empty', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({}, 200);
    });
    vi.stubGlobal('fetch', fetchMock);
    vault.unlocked = true;
    vault.getApiKey.mockResolvedValue('stored-api-key');
    repo.get.mockResolvedValue({
      id: 'svc-1',
      name: 'Stored OpenAI',
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: 'stored-cipher',
      enabled: true,
      enabledModels: ['gpt-4.1'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    render(<ModelServiceForm existingId="svc-1" preset={preset} onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue(
        'https://api.example.com/v1',
      ),
    );
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(vault.getApiKey).toHaveBeenCalledWith('svc-1');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'stored-api-key',
    });
    expect(await screen.findByText('✓ 连接成功')).toBeInTheDocument();
  });

  it('trims base URL and API key before sending model API requests', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse({ models: [] }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ModelServiceForm
        preset={{ ...preset, baseUrl: '  https://api.example.com/v1  ' }}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('API Key'), '  sk-trimmed  ');
    await user.click(screen.getByRole('button', { name: '拉取模型列表' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-trimmed',
    });
  });

  it('exposes busy status while fetching models', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveFetch = resolve as (value: Response) => void;
          }),
      ),
    );
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '拉取模型列表' }));

    const fetchButton = screen.getByRole('button', { name: '拉取中…' });
    expect(fetchButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeDisabled();
    expect(screen.getByLabelText('API Key')).toBeDisabled();
    expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByText('正在拉取模型列表，请稍候。')).toHaveAttribute('role', 'status');

    resolveFetch(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '拉取模型列表' })).toHaveAttribute(
        'aria-busy',
        'false',
      ),
    );
  });

  it('ignores duplicate fetch clicks while the request is in flight', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(() => {
          // Keep the first request pending so duplicate clicks hit the busy guard.
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    const fetchButton = screen.getByRole('button', { name: '拉取模型列表' });
    fireEvent.click(fetchButton);
    fireEvent.click(fetchButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes busy status while testing connection', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveFetch = resolve as (value: Response) => void;
          }),
      ),
    );
    render(<ModelServiceForm preset={preset} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    const testButton = screen.getByRole('button', { name: '测试中…' });
    expect(testButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toBeDisabled();
    expect(screen.getByLabelText('API Key')).toBeDisabled();
    expect(screen.getByRole('button', { name: '拉取模型列表' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByText('正在测试连接，请稍候。')).toHaveAttribute('role', 'status');

    resolveFetch(new Response('{}', { status: 200 }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '测试连接' })).toHaveAttribute(
        'aria-busy',
        'false',
      ),
    );
  });

  it('saves a new service after a successful model fetch', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vault.encryptForStorage.mockResolvedValue('encrypted-key');
    repo.create.mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            models: [
              {
                id: 'gpt-4o-mini',
                name: 'GPT-4o mini',
                supportsWebSearch: false,
                contextWindow: 128000,
                pricing: { input: 0, output: 0 },
              },
            ],
          },
          200,
        ),
      ),
    );
    vi.stubGlobal('crypto', { randomUUID: () => 'service-id' });
    render(<ModelServiceForm preset={preset} onClose={onClose} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '拉取模型列表' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'svc-service-id',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyCipher: 'encrypted-key',
        enabledModels: expect.arrayContaining(['gpt-4o', 'gpt-4o-mini']),
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('trims service fields before encrypting and saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vault.encryptForStorage.mockResolvedValue('encrypted-key');
    repo.create.mockResolvedValue(undefined);
    vi.stubGlobal('crypto', { randomUUID: () => 'service-id' });
    render(
      <ModelServiceForm
        preset={{
          ...preset,
          name: '  OpenAI  ',
          baseUrl: '  https://api.openai.com/v1  ',
        }}
        onClose={onClose}
      />,
    );

    await user.type(screen.getByLabelText('API Key'), '  sk-trimmed  ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(vault.encryptForStorage).toHaveBeenCalledWith('sk-trimmed');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyCipher: 'encrypted-key',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves existing service changes without unlocking when API key is unchanged', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vault.unlocked = false;
    repo.get.mockResolvedValue({
      id: 'svc-1',
      name: 'Stored OpenAI',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyCipher: 'stored-cipher',
      enabled: true,
      enabledModels: ['gpt-4o'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    repo.update.mockResolvedValue(undefined);
    render(<ModelServiceForm existingId="svc-1" preset={preset} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('Stored OpenAI'),
    );
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
      target: { value: 'OpenAI updated' },
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(vault.unlock).not.toHaveBeenCalled();
    expect(vault.encryptForStorage).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('svc-1', expect.objectContaining({
      name: 'OpenAI updated',
      apiKeyCipher: 'stored-cipher',
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('announces save failures, restores the save button, and keeps the form open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vault.encryptForStorage.mockResolvedValue('encrypted-key');
    repo.create.mockRejectedValueOnce(new Error('IndexedDB offline'));
    render(<ModelServiceForm preset={preset} onClose={onClose} />);

    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB offline');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled(),
    );
    expect(screen.getByRole('dialog', { name: '添加模型服务' })).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toHaveValue('sk-test');
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
