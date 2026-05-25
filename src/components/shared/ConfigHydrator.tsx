'use client';

/**
 * Calls `hydrate()` on the configStore once on app mount. Used by the
 * root layout so every page has hydrated config available.
 */
import { useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';

let configHydration: Promise<void> | null = null;

export function ConfigHydrator() {
  const hydrate = useConfigStore(s => s.hydrate);

  useEffect(() => {
    if (configHydration) {
      return;
    }

    configHydration = hydrate().catch(() => {
      configHydration = null;
    });
  }, [hydrate]);

  return null;
}

export function _resetConfigHydratorForTests(): void {
  configHydration = null;
}
