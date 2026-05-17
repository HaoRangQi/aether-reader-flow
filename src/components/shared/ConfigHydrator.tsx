'use client';

/**
 * Calls `hydrate()` on the configStore once on app mount. Used by the
 * root layout so every page has hydrated config available.
 */
import { useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';

export function ConfigHydrator() {
  const hydrate = useConfigStore(s => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return null;
}
