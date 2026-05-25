import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionAppearance } from './SelectionAppearance';
import { DEFAULT_SELECTION_PREFS, type SelectionPrefs } from '@/services/ConfigService';
import { useConfigStore } from '@/stores/configStore';

const initialConfigState = useConfigStore.getState();

const customSelectionPrefs: SelectionPrefs = {
  bubbleBg: '#123456',
  bubbleText: '#abcdef',
  bubbleAccent: '#f0f',
  resultWidth: 'compact',
};

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('SelectionAppearance', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      selectionPrefs: { ...DEFAULT_SELECTION_PREFS },
      setSelectionPrefs: vi.fn(async (selectionPrefs: SelectionPrefs) => {
        useConfigStore.setState({ selectionPrefs });
      }),
    });
  });

  it('saves edited selection preferences and announces success', async () => {
    const user = userEvent.setup();
    render(<SelectionAppearance />);

    await user.type(screen.getByRole('textbox', { name: '气泡背景色颜色值' }), '#123456');
    await user.type(screen.getByRole('textbox', { name: '气泡文字色颜色值' }), '#abc');
    await user.type(screen.getByRole('textbox', { name: '按钮强调色颜色值' }), '#fedcba');
    await user.click(screen.getByRole('button', { name: '宽屏（560px）' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setSelectionPrefs).toHaveBeenCalledWith({
      bubbleBg: '#123456',
      bubbleText: '#abc',
      bubbleAccent: '#fedcba',
      resultWidth: 'wide',
    });
    expect(screen.getByRole('status')).toHaveTextContent('划词气泡设置已保存');
  });

  it('keeps the draft and reports an alert when saving fails', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      setSelectionPrefs: vi.fn(async () => {
        throw new Error('IndexedDB offline');
      }),
    });
    render(<SelectionAppearance />);

    await user.type(screen.getByRole('textbox', { name: '气泡背景色颜色值' }), '#445566');
    await user.click(screen.getByRole('button', { name: '宽屏（560px）' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '划词气泡保存失败：IndexedDB offline',
    );
    expect(screen.getByRole('textbox', { name: '气泡背景色颜色值' })).toHaveValue('#445566');
    expect(screen.getByRole('button', { name: '宽屏（560px）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(useConfigStore.getState().selectionPrefs).toEqual(DEFAULT_SELECTION_PREFS);
  });

  it('keeps draft state consistent when reset fails', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      selectionPrefs: customSelectionPrefs,
      setSelectionPrefs: vi.fn(async () => {
        throw new Error('reset failed');
      }),
    });
    render(<SelectionAppearance />);

    await user.clear(screen.getByRole('textbox', { name: '气泡背景色颜色值' }));
    await user.type(screen.getByRole('textbox', { name: '气泡背景色颜色值' }), '#654321');
    await user.click(screen.getByRole('button', { name: '宽屏（560px）' }));
    await user.click(screen.getByRole('button', { name: '恢复默认' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '恢复默认失败：reset failed。当前草稿已保留。',
    );
    expect(screen.getByRole('textbox', { name: '气泡背景色颜色值' })).toHaveValue('#654321');
    expect(screen.getByRole('textbox', { name: '气泡文字色颜色值' })).toHaveValue('#abcdef');
    expect(screen.getByRole('button', { name: '宽屏（560px）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(useConfigStore.getState().selectionPrefs).toEqual(customSelectionPrefs);
  });

  it('disables controls while saving and prevents duplicate submissions', async () => {
    const deferred = createDeferred();
    useConfigStore.setState({
      setSelectionPrefs: vi.fn(() => deferred.promise),
    });
    render(<SelectionAppearance />);

    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(useConfigStore.getState().setSelectionPrefs).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: '恢复默认' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '气泡背景色颜色值' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '标准（400px）' })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '✓ 已保存' })).toBeEnabled();
    });
    expect(screen.getByRole('textbox', { name: '气泡背景色颜色值' })).toBeEnabled();
  });

  it('rejects invalid color text without applying it to the preview', async () => {
    const user = userEvent.setup();
    render(<SelectionAppearance />);

    const input = screen.getByRole('textbox', { name: '气泡背景色颜色值' });
    await user.type(input, 'red');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('气泡背景色仅支持 #RGB 或 #RRGGBB 格式。');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByTestId('selection-toolbar-preview').getAttribute('style')).not.toContain(
      'red',
    );
    expect(useConfigStore.getState().setSelectionPrefs).not.toHaveBeenCalled();
  });

  it('resets to defaults only after persistence succeeds', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      selectionPrefs: customSelectionPrefs,
      setSelectionPrefs: vi.fn(async (selectionPrefs: SelectionPrefs) => {
        useConfigStore.setState({ selectionPrefs });
      }),
    });
    render(<SelectionAppearance />);

    await user.click(screen.getByRole('button', { name: '恢复默认' }));

    expect(useConfigStore.getState().setSelectionPrefs).toHaveBeenCalledWith(DEFAULT_SELECTION_PREFS);
    expect(screen.getByRole('textbox', { name: '气泡背景色颜色值' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '气泡文字色颜色值' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '按钮强调色颜色值' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '标准（400px）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('划词气泡设置已保存');
  });
});
