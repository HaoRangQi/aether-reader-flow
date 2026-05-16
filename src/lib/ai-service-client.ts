/**
 * @fileoverview Client-side AIService singleton wiring.
 *
 * Threads together: AIService + KeyVault + CostMeter + ConfigService +
 * the IndexedDB-backed repos. UI components call `getAIService()` and
 * use the returned instance.
 */
'use client';

import { AIService } from '@/services/AIService';
import { CostMeter } from '@/services/CostMeter';
import { ConfigService } from '@/services/ConfigService';
import { getKeyVault } from '@/services/KeyVault';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { IndexedDBTimelineRepo } from '@/adapters/storage/IndexedDBTimelineRepo';
import { IndexedDBCostRepo } from '@/adapters/storage/IndexedDBCostRepo';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';

let _ai: AIService | null = null;

export function getAIService(): AIService {
  if (_ai) return _ai;
  const services = new IndexedDBModelServiceRepo();
  const vault = getKeyVault(services);
  const timeline = new IndexedDBTimelineRepo();
  const cost = new CostMeter(new IndexedDBCostRepo());
  const config = new ConfigService(new IndexedDBConfigRepo());
  _ai = new AIService(services, vault, timeline, cost, config);
  return _ai;
}

export function getVault() {
  return getKeyVault(new IndexedDBModelServiceRepo());
}
