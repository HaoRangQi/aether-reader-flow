import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NarrowViewportNotice } from './NarrowViewportNotice';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
}

function resizeViewportTo(width: number) {
  setViewportWidth(width);
  fireEvent(window, new Event('resize'));
}

describe('NarrowViewportNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays hidden on desktop-width viewports', () => {
    setViewportWidth(1280);

    render(<NarrowViewportNotice />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces narrow viewport guidance with actionable help', () => {
    setViewportWidth(800);

    render(<NarrowViewportNotice />);

    const alert = screen.getByRole('alert', {
      name: /建议在桌面端使用以获得最佳阅读体验/,
    });

    expect(alert).toHaveAccessibleDescription(
      '窄屏仍可阅读、划词和打开面板；阅读快捷键：← / → 切换章节，⌘/Ctrl+B 打开时间轴。',
    );
  });

  it('uses 1024px as the desktop boundary when the viewport changes', () => {
    setViewportWidth(1024);

    render(<NarrowViewportNotice />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    resizeViewportTo(1023);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('removes the resize listener on unmount', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    setViewportWidth(800);

    const { unmount } = render(<NarrowViewportNotice />);
    const resizeHandler = addListener.mock.calls.find(([eventName]) => eventName === 'resize')?.[1];

    expect(resizeHandler).toEqual(expect.any(Function));

    unmount();

    expect(removeListener).toHaveBeenCalledWith('resize', resizeHandler);
  });
});
