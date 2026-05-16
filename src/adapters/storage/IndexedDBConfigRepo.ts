/**
 * IndexedDB-backed ConfigRepo. A simple key-value store used for all
 * non-domain configuration (theme, font prefs, task routing, budget, etc).
 *
 * Values are stored as-is; the caller is responsible for serializing
 * non-structured-clone-able types. Avoid storing `Date` if you don't
 * want timezone drift on reload — store ISO strings.
 */
import { getDb } from './db';
import type { ConfigRepo } from './interfaces';

export class IndexedDBConfigRepo implements ConfigRepo {
  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await getDb().configs.get(key);
    return row ? (row.value as T) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await getDb().configs.put({ key, value });
  }

  async delete(key: string): Promise<void> {
    await getDb().configs.delete(key);
  }
}
