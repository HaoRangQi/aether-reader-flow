import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { SelectionContextMenu } from './SelectionContextMenu';

const selectionActions = vi.hoisted(() => ({
  result: null as {
    type: 'translate' | 'explain' | 'verify';
    text: string;
    streaming: boolean;
    error?: string;
  } | null,
  runInline: vi.fn(),
  openDeep: vi.fn(),
  createHighlight: vi.fn(),
  createNote: vi.fn(),
  cancelInline: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@/hooks/useSelectionActions', () => ({
  useSelectionActions: () => selectionActions,
}));

describe('SelectionContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectionActions.result = null;
    _resetReaderStoreForTests();
    useReaderStore.getState().setSelection({
      text: '需要键盘操作的选中文本',
      start: 5,
      end: 16,
      page: 2,
    });
  });

  it('renders selected text actions as a named menu', async () => {
    render(<SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={vi.fn()} />);

    const menu = screen.getByRole('menu', { name: '划词操作：需要键盘操作的选中文本' });
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      '翻译',
      '解释',
      '验证',
      '深入探讨',
      '高亮',
      '笔记',
    ]);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: '翻译' })).toHaveFocus());
  });

  it('supports keyboard navigation and Escape close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole('menuitem', { name: '翻译' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: '解释' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: '笔记' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: '翻译' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: '笔记' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('runs the focused action and closes the menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={onClose} />);

    await user.click(await screen.findByRole('menuitem', { name: '高亮' }));

    expect(selectionActions.createHighlight).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the menu open and renders inline results for AI actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={onClose} />,
    );

    await user.click(await screen.findByRole('menuitem', { name: '翻译' }));

    expect(selectionActions.runInline).toHaveBeenCalledWith('translate');
    expect(onClose).not.toHaveBeenCalled();

    selectionActions.result = {
      type: 'translate',
      text: 'translated text',
      streaming: false,
    };
    rerender(<SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={onClose} />);

    expect(screen.getByText('翻译')).toBeInTheDocument();
    expect(screen.getByText('translated text')).toBeInTheDocument();
  });

  it('opens an in-app note form instead of closing for a browser prompt', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SelectionContextMenu menuState={{ x: 40, y: 60 }} onClose={onClose} />);

    await user.click(await screen.findByRole('menuitem', { name: '笔记' }));

    expect(screen.getByRole('textbox', { name: '笔记内容' })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: '笔记内容' }), '右键菜单里的笔记');
    await user.click(screen.getByRole('button', { name: '保存笔记' }));

    expect(selectionActions.createNote).toHaveBeenCalledWith('右键菜单里的笔记');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
