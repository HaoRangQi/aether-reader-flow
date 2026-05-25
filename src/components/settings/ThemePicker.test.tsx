import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEMES } from '@/lib/themes';
import { useConfigStore } from '@/stores/configStore';
import { ThemePicker } from './ThemePicker';
import type { Theme } from '@/types/theme';

const initialConfigState = useConfigStore.getState();

const customTheme: Theme = {
  id: 'custom-readable',
  name: '高对比主题',
  light: THEMES[0].light,
  dark: THEMES[0].dark,
};

describe('ThemePicker', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
      theme: { id: 'sheepskin', mode: 'auto' },
      customThemes: [],
      setTheme: vi.fn(async theme => {
        useConfigStore.setState({ theme });
      }),
      setCustomThemes: vi.fn(async customThemes => {
        useConfigStore.setState({ customThemes });
      }),
    });
  });

  it('announces custom theme save failures and keeps the editor open', async () => {
    const user = userEvent.setup();
    const setCustomThemes = vi.fn(async () => {
      throw new Error('IndexedDB 写入失败');
    });
    useConfigStore.setState({ setCustomThemes });
    render(<ThemePicker />);

    await user.click(screen.getByRole('button', { name: '+ 新建' }));
    await user.type(screen.getByPlaceholderText('主题名称'), '夜读主题');
    await user.click(screen.getByRole('button', { name: '保存主题' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '自定义主题保存失败：IndexedDB 写入失败',
    );
    expect(screen.getByPlaceholderText('主题名称')).toHaveValue('夜读主题');
    expect(screen.getByRole('button', { name: '保存主题' })).toBeInTheDocument();
  });

  it('announces custom theme delete failures without removing the theme card', async () => {
    const user = userEvent.setup();
    const setCustomThemes = vi.fn(async () => {
      throw new Error('IndexedDB 写入失败');
    });
    useConfigStore.setState({
      customThemes: [customTheme],
      setCustomThemes,
    });
    render(<ThemePicker />);

    await user.click(screen.getByRole('button', { name: '删除主题：高对比主题' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '自定义主题删除失败：IndexedDB 写入失败',
    );
    expect(screen.getByText('高对比主题')).toBeInTheDocument();
  });

  it('prevents duplicate custom theme names before saving', async () => {
    const user = userEvent.setup();
    const setCustomThemes = vi.fn(async customThemes => {
      useConfigStore.setState({ customThemes });
    });
    useConfigStore.setState({
      customThemes: [customTheme],
      setCustomThemes,
    });
    render(<ThemePicker />);

    await user.click(screen.getByRole('button', { name: '+ 新建' }));
    await user.type(screen.getByRole('textbox', { name: '主题名称' }), '高对比主题');
    await user.click(screen.getByRole('button', { name: '保存主题' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '已存在名为“高对比主题”的自定义主题。',
    );
    expect(setCustomThemes).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '主题名称' })).toHaveValue('高对比主题');
  });

  it('labels custom theme editor color inputs for assistive technology', async () => {
    const user = userEvent.setup();
    render(<ThemePicker />);

    await user.click(screen.getByRole('button', { name: '+ 新建' }));

    expect(screen.getByRole('textbox', { name: '主题名称' })).toBeInTheDocument();
    expect(screen.getByLabelText('页面背景颜色选择')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '页面背景颜色值' })).toBeInTheDocument();
  });
});
