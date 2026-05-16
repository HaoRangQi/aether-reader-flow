/**
 * IndexedDB-backed ModelServiceRepo. Stores user-configured AI providers.
 *
 * NOTE: `apiKeyCipher` is stored as-is (an AES-GCM JSON envelope produced
 * by `CryptoService`). This repo never sees plaintext keys.
 */
import { getDb } from './db';
import type { ModelServiceRepo } from './interfaces';
import type { ModelService } from '@/types/domain';

export class IndexedDBModelServiceRepo implements ModelServiceRepo {
  async create(s: ModelService): Promise<void> {
    await getDb().modelServices.put(s);
  }

  async get(id: string): Promise<ModelService | null> {
    return (await getDb().modelServices.get(id)) ?? null;
  }

  async list(): Promise<ModelService[]> {
    return await getDb().modelServices.orderBy('name').toArray();
  }

  async update(id: string, patch: Partial<ModelService>): Promise<void> {
    await getDb().modelServices.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await getDb().modelServices.delete(id);
  }
}
