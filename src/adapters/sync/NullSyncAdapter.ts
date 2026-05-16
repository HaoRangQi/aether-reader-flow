/**
 * Default no-op `SyncAdapter`. Wired everywhere a sync hook is needed; gets
 * replaced by a real adapter when cloud sync ships.
 */
import type { SyncAdapter } from './types';

export class NullSyncAdapter implements SyncAdapter {
  async pushAll(): Promise<void> {
    /* no-op */
  }
  async pullAll(): Promise<void> {
    /* no-op */
  }
}
