/**
 * Storage debugging utilities — check IndexedDB health and persistence.
 */

export async function checkStorageHealth(): Promise<{
  available: boolean;
  persistent: boolean;
  quota: { usage: number; quota: number } | null;
  databases: string[];
  error?: string;
}> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return {
      available: false,
      persistent: false,
      quota: null,
      databases: [],
      error: 'IndexedDB not available',
    };
  }

  const errors: string[] = [];
  const storage = navigator.storage;
  let persistent = false;
  let quota: { usage: number; quota: number } | null = null;
  let databases: string[] = [];

  if (storage?.persisted) {
    try {
      persistent = await storage.persisted();
    } catch (error) {
      errors.push(`Storage persistence check failed: ${formatStorageError(error)}`);
    }
  }

  if (storage?.estimate) {
    try {
      const estimate = await storage.estimate();
      quota = {
        usage: normalizeStorageBytes(estimate.usage),
        quota: normalizeStorageBytes(estimate.quota),
      };
    } catch (error) {
      errors.push(`Storage quota check failed: ${formatStorageError(error)}`);
    }
  }

  if ('databases' in window.indexedDB && typeof window.indexedDB.databases === 'function') {
    try {
      const dbs = await window.indexedDB.databases();
      databases = dbs.map(db => db.name || 'unknown');
    } catch (error) {
      errors.push(`IndexedDB database listing failed: ${formatStorageError(error)}`);
    }
  }

  return {
    available: true,
    persistent,
    quota,
    databases,
    error: errors.length > 0 ? errors.join('；') : undefined,
  };
}

export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function logStorageHealth(): void {
  checkStorageHealth().then(health => {
    console.group('📦 Storage Health');
    console.log('Available:', health.available);
    console.log('Persistent:', health.persistent);
    if (health.quota) {
      const usageMB = (health.quota.usage / 1024 / 1024).toFixed(2);
      const quotaMB = (health.quota.quota / 1024 / 1024).toFixed(2);
      console.log(`Quota: ${usageMB} MB / ${quotaMB} MB`);
    }
    console.log('Databases:', health.databases);
    if (health.error) {
      console.error('Error:', health.error);
    }
    console.groupEnd();
  });
}

function normalizeStorageBytes(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0 ? value! : 0;
}

function formatStorageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
