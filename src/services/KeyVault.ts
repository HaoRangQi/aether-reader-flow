/**
 * @fileoverview KeyVault — cache of decrypted API keys keyed by
 * `ModelService.id`.
 *
 * Strategy:
 *   1. User enters master password once per session (UnlockDialog, T2.14).
 *   2. We keep the password in memory (`_masterPassword`) and mirror it to
 *      sessionStorage so a page refresh in the same tab does not force
 *      re-unlock.
 *   3. When an AI call needs a key, we look it up by service id. On cache
 *      miss we read the ModelService row, decrypt with the master password,
 *      cache, and return.
 *   4. `lock()` purges both the password and all decrypted keys.
 *
 * The master password is intentionally scoped to the current tab session:
 * `sessionStorage` survives reload but does not leak to other tabs.
 *
 * Why not just decrypt every call? PBKDF2 with 200k iterations is ~80ms
 * on a fast laptop. Caching makes typing-fast translation feel instant.
 */
import { CryptoService } from './CryptoService';
import type { ModelServiceRepo } from '@/adapters/storage/interfaces';

const MASTER_PASSWORD_SESSION_KEY = 'aether:key-vault:master-password';

function assertNonBlankSecret(value: string, serviceName: string): void {
  if (!value.trim()) {
    throw new Error(`Service "${serviceName}" has no API key configured.`);
  }
}

function readSessionMasterPassword(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(MASTER_PASSWORD_SESSION_KEY);
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

function writeSessionMasterPassword(password: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (password === null) {
      window.sessionStorage.removeItem(MASTER_PASSWORD_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(MASTER_PASSWORD_SESSION_KEY, password);
  } catch {
    // Ignore storage write failures (private mode / disabled storage).
  }
}

export class KeyVault {
  private _masterPassword: string | null;
  private _cache = new Map<string, string>();
  private _version = 0;
  private crypto = new CryptoService();

  constructor(private services: ModelServiceRepo) {
    this._masterPassword = readSessionMasterPassword();
  }

  get unlocked(): boolean {
    return this._masterPassword !== null;
  }

  unlock(password: string): void {
    if (!password) throw new Error('Master password cannot be empty');
    this._masterPassword = password;
    writeSessionMasterPassword(password);
    this._cache.clear();
    this._version++;
  }

  lock(): void {
    this._masterPassword = null;
    writeSessionMasterPassword(null);
    this._cache.clear();
    this._version++;
  }

  async getApiKey(serviceId: string): Promise<string> {
    const masterPassword = this._masterPassword;
    const version = this._version;
    if (!masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    const cached = this._cache.get(serviceId);
    if (cached) return cached;

    const svc = await this.services.get(serviceId);
    if (version !== this._version || this._masterPassword !== masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    if (!svc) throw new Error(`Unknown model service: ${serviceId}`);
    if (!svc.apiKeyCipher) {
      throw new Error(`Service "${svc.name}" has no API key configured.`);
    }
    const plaintext = await this.crypto.decrypt(svc.apiKeyCipher, masterPassword);
    if (version !== this._version || this._masterPassword !== masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    assertNonBlankSecret(plaintext, svc.name);
    this._cache.set(serviceId, plaintext);
    return plaintext;
  }

  async encryptForStorage(plaintext: string): Promise<string> {
    if (!this._masterPassword) {
      throw new Error('Vault is locked. Please enter your master password.');
    }
    assertNonBlankSecret(plaintext, 'model service');
    return await this.crypto.encrypt(plaintext, this._masterPassword);
  }
}

let _instance: KeyVault | null = null;
export function getKeyVault(services: ModelServiceRepo): KeyVault {
  if (!_instance) _instance = new KeyVault(services);
  return _instance;
}

export function _resetKeyVaultForTests(): void {
  _instance = null;
  writeSessionMasterPassword(null);
}
