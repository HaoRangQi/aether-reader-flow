import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetReaderStoreForTests } from '@/stores/readerStore';
import { _resetTimelineStoreForTests, useTimelineStore } from '@/stores/timelineStore';
import { KeyboardShortcuts } from './KeyboardShortcuts';

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    _resetReaderStoreForTests();
    _resetTimelineStoreForTests();
  });

  it('does not toggle reader panels from text inputs', () => {
    render(
      <>
        <input aria-label="草稿" />
        <KeyboardShortcuts />
      </>,
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: '草稿' }), {
      key: 'b',
      metaKey: true,
    });

    expect(useTimelineStore.getState().panelOpen).toBe(false);
  });

  it('toggles reader panels from non-typing surfaces', () => {
    render(<KeyboardShortcuts />);

    fireEvent.keyDown(window, {
      key: 'b',
      metaKey: true,
    });

    expect(useTimelineStore.getState().panelOpen).toBe(true);
  });
});
