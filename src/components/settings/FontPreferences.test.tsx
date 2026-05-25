import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FontPreferences } from './FontPreferences';
import { DEFAULT_FONT_PREFS, type FontPrefs } from '@/services/ConfigService';
import { useConfigStore } from '@/stores/configStore';

const initialConfigState = useConfigStore.getState();

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('FontPreferences', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      font: { ...DEFAULT_FONT_PREFS },
      setFont: vi.fn(async (font: FontPrefs) => {
        useConfigStore.setState({ font });
      }),
    });
  });

  it('exposes accessible names and descriptions for typography controls', () => {
    render(<FontPreferences />);

    expect(screen.getByRole('switch', { name: '统一字体' })).toHaveAccessibleDescription(
      '界面和阅读区使用同一字体',
    );
    expect(screen.getByRole('group', { name: '阅读字体模式' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '界面字体模式' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '阅读字号' })).toHaveAccessibleDescription(
      '12px 小 24px 大',
    );
    expect(screen.getByRole('slider', { name: '阅读行高' })).toHaveAccessibleDescription(
      '1.4 紧凑 2.2 宽松',
    );
  });

  it('labels system and custom font inputs by section', async () => {
    const user = userEvent.setup();
    render(<FontPreferences />);

    await user.click(screen.getByRole('button', { name: '阅读字体系统字体' }));
    await user.click(screen.getByRole('button', { name: '界面字体自定义' }));

    expect(screen.getByRole('combobox', { name: '阅读字体系统字体' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '界面字体自定义字体' })).toBeInTheDocument();
  });

  it('announces save feedback in a status region', async () => {
    const user = userEvent.setup();
    render(<FontPreferences />);

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setFont).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('已保存');
  });

  it('keeps the draft and reports an alert when saving fails', async () => {
    const user = userEvent.setup();
    const setFont = vi.fn(async () => {
      throw new Error('IndexedDB offline');
    });
    useConfigStore.setState({ setFont });
    render(<FontPreferences />);

    await user.click(screen.getByRole('button', { name: '阅读字体自定义' }));
    await user.type(screen.getByRole('textbox', { name: '阅读字体自定义字体' }), 'Charter, serif');
    fireEvent.change(screen.getByRole('slider', { name: '阅读字号' }), { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('字体设置保存失败：IndexedDB offline');
    expect(screen.getByRole('textbox', { name: '阅读字体自定义字体' })).toHaveValue('Charter, serif');
    expect(screen.getByRole('slider', { name: '阅读字号' })).toHaveValue('20');
    expect(useConfigStore.getState().font).toEqual(DEFAULT_FONT_PREFS);
  });

  it('disables controls while saving, prevents duplicate saves, and restores editing after failure', async () => {
    const save = deferred<void>();
    const setFont = vi.fn(async () => {
      await save.promise;
      throw new Error('write failed');
    });
    useConfigStore.setState({ setFont });
    render(<FontPreferences />);

    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(setFont).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled());
    expect(screen.getByRole('switch', { name: '统一字体' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '阅读字体系统字体' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: '阅读字号' })).toBeDisabled();

    save.resolve();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('字体设置保存失败：write failed');
    });
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(screen.getByRole('slider', { name: '阅读字号' })).toBeEnabled();
  });

  it('saves the edited font preferences successfully', async () => {
    const user = userEvent.setup();
    render(<FontPreferences />);

    await user.click(screen.getByRole('switch', { name: '统一字体' }));
    await user.click(screen.getByRole('button', { name: '字体系统字体' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '字体系统字体' }), 'Georgia, serif');
    fireEvent.change(screen.getByRole('slider', { name: '阅读行高' }), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setFont).toHaveBeenCalledWith({
      readerFamily: 'system',
      readerFontValue: 'Georgia, serif',
      readerSize: DEFAULT_FONT_PREFS.readerSize,
      readerLineHeight: 2,
      uiFamily: 'system',
      uiFontValue: 'Georgia, serif',
    });
    expect(screen.getByRole('status')).toHaveTextContent('已保存');
  });
});
