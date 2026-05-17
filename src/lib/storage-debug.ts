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
  try {
    // Check if IndexedDB is available
    if (!('indexedDB' in window)) {
      return {
        available: false,
        persistent: false,
        quota: null,
        databases: [],
        error: 'IndexedDB not available',
      };
    }

    // Check persistence
    let persistent = false;
    if (navigator.storage && navigator.storage.persist) {
      persistent = await navigator.storage.persisted();
    }

    // Check quota
    let quota = null;
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      quota = {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }

    // List databases
    let databases: string[] = [];
    if ('databases' in indexedDB) {
      const dbs = await indexedDB.databases();
      databases = dbs.map(db => db.name || 'unknown');
    }

    return {
      available: true,
      persistent,
      quota,
      databases,
    };
  } catch (e) {
    return {
      available: false,
      persistent: false,
      quota: null,
      databases: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persist) {
    return false;
  }
  return await navigator.storage.persist();
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
