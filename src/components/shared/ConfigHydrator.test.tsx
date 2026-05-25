import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConfigStoreForTests, useConfigStore } from '@/stores/configStore';
import { ConfigHydrator, _resetConfigHydratorForTests } from './ConfigHydrator';

describe('ConfigHydrator', () => {
  beforeEach(() => {
    _resetConfigStoreForTests();
    _resetConfigHydratorForTests();
  });

  it('hydrates once when React StrictMode replays effects', async () => {
    const hydrate = vi.fn().mockResolvedValue(undefined);
    useConfigStore.setState({ hydrate });

    render(
      <StrictMode>
        <ConfigHydrator />
      </StrictMode>,
    );

    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('does not hydrate again when the store action reference changes', () => {
    const firstHydrate = vi.fn().mockResolvedValue(undefined);
    const secondHydrate = vi.fn().mockResolvedValue(undefined);
    useConfigStore.setState({ hydrate: firstHydrate });

    const { rerender } = render(<ConfigHydrator />);
    act(() => {
      useConfigStore.setState({ hydrate: secondHydrate });
    });
    rerender(<ConfigHydrator />);

    expect(firstHydrate).toHaveBeenCalledTimes(1);
    expect(secondHydrate).not.toHaveBeenCalled();
  });

  it('allows a later mount to retry after hydration fails', async () => {
    const failedHydrate = vi.fn().mockRejectedValue(new Error('IndexedDB offline'));
    const retryHydrate = vi.fn().mockResolvedValue(undefined);
    useConfigStore.setState({ hydrate: failedHydrate });

    const first = render(<ConfigHydrator />);

    await waitFor(() => {
      expect(failedHydrate).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(failedHydrate).toHaveBeenCalledTimes(1);
    });

    first.unmount();
    act(() => {
      useConfigStore.setState({ hydrate: retryHydrate });
    });
    render(<ConfigHydrator />);

    await waitFor(() => {
      expect(retryHydrate).toHaveBeenCalledTimes(1);
    });
  });
});
