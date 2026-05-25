import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRoutingConfig } from './TaskRoutingConfig';
import { useConfigStore } from '@/stores/configStore';
import type { ModelService, TaskRouting } from '@/types/domain';

const listMock = vi.hoisted(() => vi.fn());

vi.mock('@/adapters/storage/IndexedDBModelServiceRepo', () => ({
  IndexedDBModelServiceRepo: vi.fn(() => ({
    list: listMock,
  })),
}));

const initialConfigState = useConfigStore.getState();

const routing: TaskRouting = {
  translate: { serviceId: 'svc-anthropic', modelId: 'claude-sonnet' },
  explain: { serviceId: 'svc-anthropic', modelId: 'claude-sonnet' },
  verify: { serviceId: 'svc-anthropic', modelId: 'claude-sonnet' },
  summarize: { serviceId: 'svc-anthropic', modelId: 'claude-sonnet' },
  chat: { serviceId: 'svc-anthropic', modelId: 'claude-sonnet' },
};

const service = (patch: Partial<ModelService> = {}): ModelService => ({
  id: 'svc-anthropic',
  name: 'Anthropic',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKeyCipher: 'fake-cipher',
  enabled: true,
  enabledModels: ['claude-sonnet'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

describe('TaskRoutingConfig', () => {
  beforeEach(() => {
    listMock.mockReset();
    useConfigStore.setState({
      ...initialConfigState,
      hydrated: true,
      routing,
      setRouting: vi.fn(async (nextRouting: TaskRouting) => {
        useConfigStore.setState({ routing: nextRouting });
      }),
    });
  });

  it('announces model service loading state', async () => {
    let resolveList: (services: ModelService[]) => void = () => undefined;
    listMock.mockImplementation(
      () =>
        new Promise<ModelService[]>(resolve => {
          resolveList = resolve;
        }),
    );

    render(<TaskRoutingConfig />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载模型服务列表…');

    resolveList([service()]);
    await screen.findByRole('combobox', { name: '统一应用模型' });
  });

  it('announces model service load failures as an alert', async () => {
    listMock.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    render(<TaskRoutingConfig />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '模型服务列表加载失败：IndexedDB unavailable',
    );
  });

  it('keeps the current selection and announces a save failure', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([
      service(),
      service({
        id: 'svc-openai',
        name: 'OpenAI',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        enabledModels: ['gpt-4.1'],
      }),
    ]);
    useConfigStore.setState({
      setRouting: vi.fn(async () => {
        throw new Error('Quota exceeded');
      }),
    });

    render(<TaskRoutingConfig />);

    const translateSelect = await screen.findByRole('combobox', { name: '划词翻译模型' });
    expect(translateSelect).toHaveDisplayValue('Anthropic · claude-sonnet');

    await user.selectOptions(translateSelect, 'svc-openai::gpt-4.1');

    expect(useConfigStore.getState().setRouting).toHaveBeenCalledWith({
      ...routing,
      translate: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '任务路由保存失败：Quota exceeded。已保留当前选择。',
    );
    await waitFor(() => expect(translateSelect).toHaveDisplayValue('Anthropic · claude-sonnet'));
  });

  it('allows verify to use models without explicit Web Search support', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([
      service(),
      service({
        id: 'svc-openai',
        name: 'OpenAI',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        enabledModels: ['gpt-4.1'],
      }),
    ]);

    render(<TaskRoutingConfig />);

    const verifySelect = await screen.findByRole('combobox', { name: '联网验证模型' });
    expect(verifySelect).toHaveDisplayValue('Anthropic · claude-sonnet（Web Search）');
    expect(
      within(verifySelect).getByRole('option', { name: 'OpenAI · gpt-4.1' }),
    ).toBeInTheDocument();

    await user.selectOptions(verifySelect, 'svc-openai::gpt-4.1');

    expect(useConfigStore.getState().setRouting).toHaveBeenCalledWith({
      ...routing,
      verify: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
    });
  });

  it('applies a model without explicit Web Search support to verify too', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue([
      service(),
      service({
        id: 'svc-openai',
        name: 'OpenAI',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        enabledModels: ['gpt-4.1'],
      }),
    ]);

    render(<TaskRoutingConfig />);

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '统一应用模型' }),
      'svc-openai::gpt-4.1',
    );

    expect(useConfigStore.getState().setRouting).toHaveBeenCalledWith({
      translate: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      explain: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      verify: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      summarize: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      chat: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
    });
  });
});
