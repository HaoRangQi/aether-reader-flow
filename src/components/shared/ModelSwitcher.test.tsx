import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TASK_ROUTING } from '@/services/ConfigService';
import { useConfigStore } from '@/stores/configStore';
import type { ModelService, TaskRouting } from '@/types/domain';
import { ModelSwitcher } from './ModelSwitcher';

const listMock = vi.hoisted(() => vi.fn());

vi.mock('@/adapters/storage/IndexedDBModelServiceRepo', () => ({
  IndexedDBModelServiceRepo: vi.fn(function IndexedDBModelServiceRepo() {
    return {
      list: listMock,
    };
  }),
}));

const initialConfigState = useConfigStore.getState();

const service = (patch: Partial<ModelService> = {}): ModelService => ({
  id: 'svc-openai',
  name: 'OpenAI',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyCipher: 'fake-cipher',
  enabled: true,
  enabledModels: ['gpt-4.1', 'gpt-4.1-mini'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...patch,
});

describe('ModelSwitcher', () => {
  beforeEach(() => {
    listMock.mockReset();
    useConfigStore.setState({
      ...initialConfigState,
      routing: DEFAULT_TASK_ROUTING,
    });
  });

  it('renders a disabled error state when model services fail to load', async () => {
    listMock.mockRejectedValue(new Error('IndexedDB unavailable'));

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeDisabled());
    expect(select).toHaveDisplayValue('模型加载失败');
    expect(select).toHaveAccessibleDescription('模型列表加载失败，模型切换器已禁用。');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('模型列表加载失败，模型切换器已禁用。');
  });

  it('renders a disabled empty state when no enabled models are available', async () => {
    listMock.mockResolvedValue([]);

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeDisabled());
    expect(select).toHaveDisplayValue('无可用模型');
    expect(select).toHaveAccessibleDescription('没有可用模型服务或已启用模型，模型切换器已禁用。');
    expect(screen.getByRole('status')).toHaveTextContent(
      '没有可用模型服务或已启用模型，模型切换器已禁用。',
    );
  });

  it('explains missing task routing while keeping available models selectable', async () => {
    listMock.mockResolvedValue([service()]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: undefined,
      } as unknown as TaskRouting,
    });

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveDisplayValue('当前任务未配置模型');
    expect(select).toHaveAccessibleDescription('当前任务未配置模型路由，可从列表选择临时模型。');
    expect(screen.getByRole('option', { name: 'OpenAI · gpt-4.1' })).toBeInTheDocument();
  });

  it('keeps the dropdown usable when the routed model is no longer available', async () => {
    listMock.mockResolvedValue([service()]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: { serviceId: 'svc-openai', modelId: 'retired-model' },
      },
    });

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveDisplayValue('（不可用）retired-model');
    expect(select).toHaveAccessibleDescription('当前服务或模型不可用，可从列表选择临时模型。');
    expect(screen.getByRole('option', { name: 'OpenAI · gpt-4.1' })).toBeInTheDocument();
  });

  it('allows selecting another available model', async () => {
    const user = userEvent.setup();
    const onOverride = vi.fn();
    listMock.mockResolvedValue([service()]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      },
    });

    render(<ModelSwitcher taskType="chat" onOverride={onOverride} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveDisplayValue('OpenAI · gpt-4.1');
    expect(select).toHaveAccessibleDescription('可为当前任务临时切换模型。');

    await user.selectOptions(select, 'svc-openai::gpt-4.1-mini');

    expect(onOverride).toHaveBeenCalledWith({
      serviceId: 'svc-openai',
      modelId: 'gpt-4.1-mini',
    });
  });

  it('deduplicates repeated enabled model ids for a service', async () => {
    listMock.mockResolvedValue([service({ enabledModels: ['gpt-4.1', 'gpt-4.1', 'gpt-4.1-mini'] })]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      },
    });

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '切换模型' })).toHaveDisplayValue(
        'OpenAI · gpt-4.1',
      ),
    );

    expect(screen.getAllByRole('option', { name: 'OpenAI · gpt-4.1' })).toHaveLength(1);
  });

  it('filters disabled services while keeping enabled services selectable', async () => {
    listMock.mockResolvedValue([
      service({ id: 'svc-disabled', name: 'Disabled', enabled: false, enabledModels: ['hidden-model'] }),
      service({ id: 'svc-enabled', name: 'Enabled', enabledModels: ['visible-model'] }),
    ]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: { serviceId: 'svc-enabled', modelId: 'visible-model' },
      },
    });

    render(<ModelSwitcher taskType="chat" onOverride={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveDisplayValue('Enabled · visible-model');
    expect(screen.getByRole('option', { name: 'Enabled · visible-model' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Disabled · hidden-model' })).not.toBeInTheDocument();
  });

  it('shows an active override instead of the configured route', async () => {
    listMock.mockResolvedValue([service()]);
    useConfigStore.setState({
      routing: {
        ...DEFAULT_TASK_ROUTING,
        chat: { serviceId: 'svc-openai', modelId: 'gpt-4.1' },
      },
    });

    render(
      <ModelSwitcher
        taskType="chat"
        override={{ serviceId: 'svc-openai', modelId: 'gpt-4.1-mini' }}
        onOverride={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: '切换模型' });

    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveDisplayValue('OpenAI · gpt-4.1-mini');
    expect(select).toHaveAccessibleDescription('已为当前对话临时覆盖模型。');
  });
});
