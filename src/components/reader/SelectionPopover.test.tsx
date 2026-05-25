import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@/stores/configStore';
import { _resetReaderStoreForTests, useReaderStore } from '@/stores/readerStore';
import { DEFAULT_SELECTION_PREFS } from '@/services/ConfigService';
import { SelectionPopover } from './SelectionPopover';

const selectionActions = vi.hoisted(() => ({
  result: null as {
    type: 'translate' | 'explain' | 'verify';
    text: string;
    streaming: boolean;
    error?: string;
    retryable?: boolean;
  } | null,
  runInline: vi.fn(),
  openDeep: vi.fn(),
  createHighlight: vi.fn(),
  createNote: vi.fn(),
  cancelInline: vi.fn(),
  close: vi.fn(),
  clearResult: vi.fn(),
}));

vi.mock('@/hooks/useSelectionActions', () => ({
  useSelectionActions: () => selectionActions,
}));

const initialConfigState = useConfigStore.getState();

describe('SelectionPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetReaderStoreForTests();
    selectionActions.result = null;
    useConfigStore.setState({
      ...initialConfigState,
      selectionPrefs: DEFAULT_SELECTION_PREFS,
    });
    useReaderStore.getState().setSelection({
      text: '需要解释的选中文本',
      start: 3,
      end: 12,
      page: 1,
    });
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          top: 120,
          left: 80,
          width: 160,
          height: 24,
          right: 240,
          bottom: 144,
          x: 80,
          y: 120,
          toJSON: () => undefined,
        }),
      }),
    } as unknown as Selection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('announces streaming inline AI results as a polite status region', async () => {
    selectionActions.result = {
      type: 'explain',
      text: '',
      streaming: true,
    };

    render(<SelectionPopover />);

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('…');
  });

  it('announces retryable inline AI errors and keeps retry available', async () => {
    const user = userEvent.setup();
    selectionActions.result = {
      type: 'verify',
      text: 'partial answer',
      streaming: false,
      error: '模型请求超时',
      retryable: true,
    };

    render(<SelectionPopover />);

    expect(await screen.findByRole('alert')).toHaveTextContent('模型请求超时');
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(selectionActions.runInline).toHaveBeenCalledWith('verify');
  });

  it('announces successful highlight creation after clearing the selection', async () => {
    const user = userEvent.setup();
    selectionActions.createHighlight.mockImplementationOnce(async () => {
      useReaderStore.getState().setSelection(null);
    });

    render(<SelectionPopover />);

    await user.click(await screen.findByRole('button', { name: '高亮' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('高亮已创建');
    expect(screen.queryByRole('button', { name: '高亮' })).not.toBeInTheDocument();
  });

  it('announces successful note creation after clearing the selection', async () => {
    const user = userEvent.setup();
    selectionActions.createNote.mockImplementationOnce(async () => {
      useReaderStore.getState().setSelection(null);
    });

    render(<SelectionPopover />);

    await user.click(await screen.findByRole('button', { name: '笔记' }));
    expect(await screen.findByRole('textbox', { name: '笔记内容' })).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: '笔记内容' }), '这段值得复盘');
    await user.click(screen.getByRole('button', { name: '保存笔记' }));

    expect(selectionActions.createNote).toHaveBeenCalledWith('这段值得复盘');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('笔记已创建');
    expect(screen.queryByRole('button', { name: '笔记' })).not.toBeInTheDocument();
  });

  it('announces highlight creation failures and restores the action button', async () => {
    const user = userEvent.setup();
    selectionActions.createHighlight.mockRejectedValueOnce(
      new Error('批注写入失败'),
    );

    render(<SelectionPopover />);

    await user.click(await screen.findByRole('button', { name: '高亮' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '高亮创建失败：批注写入失败',
    );
    expect(screen.queryByRole('status', { name: /已创建/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '高亮' })).toBeEnabled();
  });

  it('announces note creation failures and restores the action button', async () => {
    const user = userEvent.setup();
    selectionActions.createNote.mockRejectedValueOnce(
      new Error('批注写入失败'),
    );

    render(<SelectionPopover />);

    await user.click(await screen.findByRole('button', { name: '笔记' }));
    await user.type(await screen.findByRole('textbox', { name: '笔记内容' }), '失败笔记');
    await user.click(screen.getByRole('button', { name: '保存笔记' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '笔记创建失败：批注写入失败',
    );
    expect(screen.queryByRole('status', { name: /已创建/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存笔记' })).toBeEnabled();
  });

  it('disables annotation actions while a highlight is being saved', async () => {
    const user = userEvent.setup();
    let resolveHighlight: () => void = () => undefined;
    selectionActions.createHighlight.mockImplementationOnce(
      () => new Promise<void>(resolve => {
        resolveHighlight = resolve;
      }),
    );

    render(<SelectionPopover />);

    await user.click(await screen.findByRole('button', { name: '高亮' }));

    expect(await screen.findByRole('button', { name: '保存中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '笔记' })).toBeDisabled();

    resolveHighlight();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '高亮' })).toBeEnabled();
    });
  });
});
