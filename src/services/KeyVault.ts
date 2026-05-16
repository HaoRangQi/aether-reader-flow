/**
 * @fileoverview KeyVault — in-memory cache of decrypted API keys keyed by
 * `ModelService.id`. Lives for the page session; lost on reload.
 *
 * Strategy:
 *   1. User enters master password once per session (UnlockDialog, T2.14).
 *   2. We store the password ONLY in memory (`_masterPassword`).
 *   3. When an AI call needs a key, we look it up by service id. On cache
 *      miss we read the ModelService row, decrypt with the master password,
 *      cache, and return.
 *   4. `lock()` purges both the password and all decrypted keys.
 *
 * The master password is intentionally NOT persisted (no sessionStorage):
 *   - sessionStorage survives F5 reload, which is fine
 *   - but it also survives across tabs of the same origin, which we
 *     don't want — easier to require re-unlock per tab.
 *
 * Why not just decrypt every call? PBKDF2 with 200k iterations is ~80ms
 * on a fast laptop. Caching makes typing-fast translation feel instant.
 */
import { CryptoService } from './CryptoService';
import type { ModelServiceRepo } from '@/adapters/storage/interfaces';

export class KeyVault {
  private _masterPassword: string | null = null;
  private _cache = new Map<string, string>();
  private crypto = new CryptoService();

  constructor(private services: ModelServiceRepo) {}

  /** True once `unlock()` has accepted a password (regardless of which). */
  get unlocked(): boolean {
    return this._masterPassword !== null;
  }

  /**
   * Set the master password for this session. Does NOT verify it; the
   * password is only checked when actually decrypting a key. A wrong
   * password leads to a runtime error on the first `getApiKey()` call.
   */
  unlock(password: string): void {
    if (!password) throw new Error('Master password cannot be empty');
    this._masterPassword = password;
    this._cache.clear();
  }

  /** Forget the master password and clear all cached plaintext keys. */
  lock(): void {
    this._masterPassword = null;
    this._cache.clear();
  }

  /**
   * Decrypt the API key for a given service id, caching the result.
   * Throws if not unlocked, the service doesn't exist, or the password
   * is wrong.
   */
  async getApiKey(serviceId: string): Promise<string> {
    if (!this._masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    const cached = this._cache.get(serviceId);
    if (cached) return cached;

    const svc = await this.services.get(serviceId);
    if (!svc) throw new Error(`Unknown model service: ${serviceId}`);
    if (!svc.apiKeyCipher) {
      throw new Error(`Service "${svc.name}" has no API key configured.`);
    }
    const plaintext = await this.crypto.decrypt(svc.apiKeyCipher, this._masterPassword);
    this._cache.set(serviceId, plaintext);
    return plaintext;
  }

  /**
   * Encrypt a fresh plaintext key under the current master password.
   * Used when the user adds or updates a ModelService.
   */
  async encryptForStorage(plaintext: string): Promise<string> {
    if (!this._masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    return await this.crypto.encrypt(plaintext, this._masterPassword);
  }
}

/**
 * Process-wide singleton. The vault is intentionally per-tab (lives in
 * the JS heap of the page); each tab/window gets a fresh instance.
 */
let _instance: KeyVault | null = null;
export function getKeyVault(services: ModelServiceRepo): KeyVault {
  if (!_instance) _instance = new KeyVault(services);
  return _instance;
}

/** Test-only: clears the singleton. */
export function _resetKeyVaultForTests(): void {
  _instance = null;
}
