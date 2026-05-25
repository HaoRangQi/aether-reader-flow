import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguagePicker } from './LanguagePicker';
import { useConfigStore } from '@/stores/configStore';
import type { Locale } from '@/lib/i18n';

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

describe('LanguagePicker', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
      localeOverride: null,
      setLocaleOverride: vi.fn(async (localeOverride: Locale | null) => {
        useConfigStore.setState({
          localeOverride,
          locale: localeOverride ?? 'zh',
        });
      }),
    });
  });

  it('exposes the language choices as a named group', () => {
    render(<LanguagePicker />);

    const group = screen.getByRole('group', { name: '语言' });

    expect(within(group).getByRole('button', { name: /跟随浏览器/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '简体中文' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('marks the current language choice and announces it in a status region', () => {
    useConfigStore.setState({ localeOverride: 'zh' });

    render(<LanguagePicker />);

    expect(screen.getByRole('button', { name: /跟随浏览器/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: '简体中文' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status')).toHaveTextContent('简体中文');
  });

  it('updates the selected state and status text when a language is picked', async () => {
    const user = userEvent.setup();
    render(<LanguagePicker />);

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(useConfigStore.getState().setLocaleOverride).toHaveBeenCalledWith('en');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('English');
  });

  it('announces save failures and keeps the current selected language', async () => {
    const user = userEvent.setup();
    const setLocaleOverride = vi.fn(async () => {
      throw new Error('IndexedDB 写入失败');
    });
    useConfigStore.setState({
      locale: 'zh',
      localeOverride: 'zh',
      setLocaleOverride,
    });
    render(<LanguagePicker />);

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '语言设置保存失败：IndexedDB 写入失败',
    );
    expect(setLocaleOverride).toHaveBeenCalledWith('en');
    expect(screen.getByRole('button', { name: '简体中文' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status')).toHaveTextContent('简体中文');
  });

  it('disables choices while saving and restores them after completion', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const setLocaleOverride = vi.fn(async (localeOverride: Locale | null) => {
      await deferred.promise;
      useConfigStore.setState({
        localeOverride,
        locale: localeOverride ?? 'zh',
      });
    });
    useConfigStore.setState({ setLocaleOverride });
    render(<LanguagePicker />);

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByRole('group', { name: '语言' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('正在保存语言设置…');
    expect(screen.getByRole('button', { name: /跟随浏览器/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '简体中文' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'English' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '简体中文' }));
    expect(setLocaleOverride).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'false');
    });
    screen.getAllByRole('button').forEach(button => {
      expect(button).toBeEnabled();
    });
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('English');
  });
});
