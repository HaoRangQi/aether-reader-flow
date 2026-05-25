import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsLayout, type SectionId } from './SettingsLayout';
import { useConfigStore } from '@/stores/configStore';

const initialConfigState = useConfigStore.getState();

const sections: Record<SectionId, React.ReactNode> = {
  models: <section>Models panel</section>,
  routing: <section>Routing panel</section>,
  budget: <section>Budget panel</section>,
  theme: <section>Theme panel</section>,
  font: <section>Font panel</section>,
  language: <section>Language panel</section>,
  selection: <section>Selection panel</section>,
  prompts: <section>Prompts panel</section>,
  storage: <section>Storage panel</section>,
};

describe('SettingsLayout', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      locale: 'zh',
    });
    window.history.replaceState(null, '', '/settings');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the section from a valid initial hash', () => {
    window.history.replaceState(null, '', '/settings#language');

    render(<SettingsLayout sections={sections} />);

    expect(screen.getByText('Language panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '语言' })).toHaveAttribute('aria-current', 'page');
  });

  it('updates the hash when a section is selected', async () => {
    const user = userEvent.setup();
    render(<SettingsLayout sections={sections} />);

    await user.click(screen.getByRole('button', { name: '成本预算' }));

    expect(window.location.hash).toBe('#budget');
    expect(screen.getByText('Budget panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '成本预算' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not add duplicate history entries when reselecting the current hash section', async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<SettingsLayout sections={sections} />);

    await user.click(screen.getByRole('button', { name: '成本预算' }));
    await user.click(screen.getByRole('button', { name: '成本预算' }));

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#budget');
    expect(screen.getByText('Budget panel')).toBeInTheDocument();
  });

  it('switches section on hashchange for valid hashes', () => {
    render(<SettingsLayout sections={sections} />);

    act(() => {
      window.history.pushState(null, '', '#storage');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByText('Storage panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '存储状态' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
