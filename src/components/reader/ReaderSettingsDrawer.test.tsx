import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';

vi.mock('@/components/settings/SettingsLayout', () => ({
  SettingsLayout: () => <div>设置内容</div>,
}));

vi.mock('@/components/settings/ModelServiceConfig', () => ({
  ModelServiceConfig: () => <div />,
}));

vi.mock('@/components/settings/TaskRoutingConfig', () => ({
  TaskRoutingConfig: () => <div />,
}));

vi.mock('@/components/settings/BudgetConfig', () => ({
  BudgetConfig: () => <div />,
}));

vi.mock('@/components/settings/ThemePicker', () => ({
  ThemePicker: () => <div />,
}));

vi.mock('@/components/settings/FontPreferences', () => ({
  FontPreferences: () => <div />,
}));

vi.mock('@/components/settings/LanguagePicker', () => ({
  LanguagePicker: () => <div />,
}));

vi.mock('@/components/settings/StorageDebug', () => ({
  StorageDebug: () => <div />,
}));

vi.mock('@/components/settings/SelectionAppearance', () => ({
  SelectionAppearance: () => <div />,
}));

vi.mock('@/components/settings/PromptConfig', () => ({
  PromptConfig: () => <div />,
}));

function DrawerHarness({ withTrigger = false }: { withTrigger?: boolean }) {
  const [open, setOpen] = useState(!withTrigger);
  return (
    <>
      {withTrigger && (
        <button type="button" onClick={() => setOpen(true)}>
          打开设置
        </button>
      )}
      <ReaderSettingsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('ReaderSettingsDrawer', () => {
  it('renders as a named modal dialog with an accessible close button', () => {
    render(<ReaderSettingsDrawer open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '设置' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByRole('button', { name: '关闭设置' })).toBeInTheDocument();
    expect(screen.getByText('设置内容')).toBeInTheDocument();
  });

  it('moves focus into the drawer and restores the previous focus on close', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness withTrigger />);

    const trigger = screen.getByRole('button', { name: '打开设置' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const closeButton = await screen.findByRole('button', { name: '关闭设置' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.click(closeButton);

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes and removes the dialog when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument();
  });

  it('closes and removes the dialog from the close button', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await user.click(screen.getByRole('button', { name: '关闭设置' }));

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument();
  });
});
