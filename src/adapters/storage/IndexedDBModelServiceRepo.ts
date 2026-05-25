/**
 * IndexedDB-backed ModelServiceRepo. Stores user-configured AI providers.
 *
 * NOTE: `apiKeyCipher` is stored as-is (an AES-GCM JSON envelope produced
 * by `CryptoService`). This repo never sees plaintext keys.
 */
import { getDb } from './db';
import type { ModelServiceRepo } from './interfaces';
import type { ModelService } from '@/types/domain';

function normalizeEnabledModels(enabledModels: unknown): string[] {
  if (!Array.isArray(enabledModels)) return [];

  const seen = new Set<string>();
  return enabledModels.reduce<string[]>((models, model) => {
    if (typeof model !== 'string') return models;
    const normalized = model.trim();
    if (!normalized || seen.has(normalized)) return models;
    seen.add(normalized);
    models.push(normalized);
    return models;
  }, []);
}

function normalizeModelService(service: ModelService): ModelService {
  return {
    ...service,
    enabledModels: normalizeEnabledModels(service.enabledModels),
  };
}

export class IndexedDBModelServiceRepo implements ModelServiceRepo {
  async create(s: ModelService): Promise<void> {
    await getDb().modelServices.put(normalizeModelService(s));
  }

  async get(id: string): Promise<ModelService | null> {
    return (await getDb().modelServices.get(id)) ?? null;
  }

  async list(): Promise<ModelService[]> {
    return await getDb().modelServices.orderBy('name').toArray();
  }

  async update(id: string, patch: Partial<ModelService>): Promise<void> {
    await getDb().modelServices.update(id, {
      ...patch,
      ...(patch.enabledModels !== undefined
        ? { enabledModels: normalizeEnabledModels(patch.enabledModels) }
        : {}),
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().modelServices.delete(id);
  }
}
