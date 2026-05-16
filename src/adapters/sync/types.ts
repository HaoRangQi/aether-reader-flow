/**
 * @fileoverview SyncAdapter — placeholder for the future cloud-sync layer.
 *
 * MVP is local-first: everything lives in IndexedDB and there is no cloud.
 * But we lock in the interface now so that:
 *
 *   1. Business code never grows hidden assumptions about "data is local".
 *   2. When P2+ cloud sync arrives (Supabase / CloudKit / custom), only
 *      one new file (`*SyncAdapter.ts`) gets implemented.
 *
 * The default `NullSyncAdapter` is a no-op so wiring it everywhere is safe.
 */

export interface SyncAdapter {
  /** Push all local changes upstream. */
  pushAll(): Promise<void>;
  /** Pull all upstream changes into the local store. */
  pullAll(): Promise<void>;
}
