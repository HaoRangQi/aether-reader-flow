import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyLibrary } from './EmptyLibrary';
import { useConfigStore } from '@/stores/configStore';

const emptyTitle = '书架还是空的';
const emptyDescription =
  '上传你的第一本书（PDF 或 EPUB），让 AI 陪你读懂。每一次提问、每一次验证，都会被记录到你的思考文档里。';

describe('EmptyLibrary', () => {
  beforeEach(() => {
    useConfigStore.setState({ locale: 'zh' });
  });

  it('exposes the empty shelf heading and region description', () => {
    render(<EmptyLibrary onUpload={vi.fn()} />);

    expect(screen.getByRole('heading', { name: emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: emptyTitle })).toHaveAccessibleDescription(
      emptyDescription,
    );
  });

  it('labels the upload action and calls the upload handler', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<EmptyLibrary onUpload={onUpload} />);

    const uploadButton = screen.getByRole('button', { name: '上传书籍' });
    expect(uploadButton).toHaveAccessibleDescription(emptyDescription);

    await user.click(uploadButton);

    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps the upload call to action keyboard reachable', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<EmptyLibrary onUpload={onUpload} />);

    await user.tab();
    expect(screen.getByRole('button', { name: '上传书籍' })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('guards the upload entry point from duplicate clicks', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<EmptyLibrary onUpload={onUpload} />);

    const uploadButton = screen.getByRole('button', { name: '上传书籍' });
    await user.dblClick(uploadButton);

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(uploadButton).toBeDisabled();
  });
});
