import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptConfig } from './PromptConfig';
import { useConfigStore } from '@/stores/configStore';
import { DEFAULT_PROMPT_OVERRIDES, type PromptOverrides } from '@/services/ConfigService';

const initialConfigState = useConfigStore.getState();

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('PromptConfig', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      promptOverrides: DEFAULT_PROMPT_OVERRIDES,
      setPromptOverrides: vi.fn(async (promptOverrides: PromptOverrides) => {
        useConfigStore.setState({ promptOverrides });
      }),
    });
  });

  it('exposes task choices and editor state accessibly', () => {
    render(<PromptConfig />);

    const taskGroup = screen.getByRole('group', { name: '选择提示词任务' });
    expect(within(taskGroup).getByRole('button', { name: '划词翻译' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(taskGroup).getByRole('button', { name: '概念解释' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: '概念解释' })).toHaveAccessibleDescription(
      expect.stringContaining('解释概念'),
    );
    expect(screen.getByRole('status')).toHaveTextContent('全部任务使用默认提示词');
  });

  it('edits and saves a prompt override', async () => {
    const user = userEvent.setup();
    render(<PromptConfig />);

    await user.clear(screen.getByRole('textbox', { name: '概念解释' }));
    await user.type(screen.getByRole('textbox', { name: '概念解释' }), '请用苏格拉底式提问解释概念。');

    expect(screen.getByRole('status')).toHaveTextContent('已自定义 1 个任务');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setPromptOverrides).toHaveBeenCalledWith({
      ...DEFAULT_PROMPT_OVERRIDES,
      explain: '请用苏格拉底式提问解释概念。',
    });
    expect(screen.getByRole('status')).toHaveTextContent('提示词设置已保存');
  });

  it('resets one customized task to the built-in default', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      promptOverrides: {
        ...DEFAULT_PROMPT_OVERRIDES,
        explain: '临时解释提示词',
        chat: '临时对话提示词',
      },
    });

    render(<PromptConfig />);

    expect(screen.getByRole('button', { name: '概念解释，已自定义' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '恢复默认' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setPromptOverrides).toHaveBeenCalledWith({
      ...DEFAULT_PROMPT_OVERRIDES,
      chat: '临时对话提示词',
    });
  });

  it('resets all customized tasks and disables reset all when clean', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      promptOverrides: {
        ...DEFAULT_PROMPT_OVERRIDES,
        translate: '临时翻译提示词',
        summarize: '临时总结提示词',
      },
    });

    render(<PromptConfig />);

    await user.click(screen.getByRole('button', { name: '全部恢复默认' }));

    expect(useConfigStore.getState().setPromptOverrides).toHaveBeenCalledWith(
      DEFAULT_PROMPT_OVERRIDES,
    );
    expect(screen.getByRole('button', { name: '全部恢复默认' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('提示词设置已保存');
  });

  it('shows an alert and keeps draft text when saving fails', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      setPromptOverrides: vi.fn(async () => {
        throw new Error('write failed');
      }),
    });

    render(<PromptConfig />);

    const editor = screen.getByRole('textbox', { name: '概念解释' });
    await user.clear(editor);
    await user.type(editor, '失败后仍要保留的解释提示词');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('提示词保存失败，请检查后重试。');
    expect(screen.getByRole('textbox', { name: '概念解释' })).toHaveValue(
      '失败后仍要保留的解释提示词',
    );
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('shows an alert and restores draft text when reset all fails', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      setPromptOverrides: vi.fn(async () => {
        throw new Error('reset failed');
      }),
    });

    render(<PromptConfig />);

    const editor = screen.getByRole('textbox', { name: '概念解释' });
    await user.clear(editor);
    await user.type(editor, '恢复失败后仍要保留的解释提示词');
    await user.click(screen.getByRole('button', { name: '全部恢复默认' }));

    expect(screen.getByRole('alert')).toHaveTextContent('恢复默认失败，请检查后重试。');
    expect(screen.getByRole('textbox', { name: '概念解释' })).toHaveValue(
      '恢复失败后仍要保留的解释提示词',
    );
    expect(screen.getByRole('button', { name: '全部恢复默认' })).toBeEnabled();
  });

  it('disables prompt actions while saving and restores them after completion', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    useConfigStore.setState({
      setPromptOverrides: vi.fn(() => deferred.promise),
    });

    render(<PromptConfig />);

    await user.clear(screen.getByRole('textbox', { name: '概念解释' }));
    await user.type(screen.getByRole('textbox', { name: '概念解释' }), '需要等待的解释提示词');

    const saveButton = screen.getByRole('button', { name: '保存' });
    await user.click(saveButton);

    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '处理中...' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '概念解释' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '保存中...' }));
    expect(useConfigStore.getState().setPromptOverrides).toHaveBeenCalledTimes(1);

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '✓ 已保存' })).toBeEnabled();
    });
    expect(screen.getByRole('textbox', { name: '概念解释' })).toBeEnabled();
  });
});
