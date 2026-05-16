import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { CryptoService } from './CryptoService';
import { KeyVault, _resetKeyVaultForTests } from './KeyVault';
import type { ModelService } from '@/types/domain';

const seedService = async (
  repo: IndexedDBModelServiceRepo,
  password: string,
  plain: string,
): Promise<ModelService> => {
  const cipher = await new CryptoService().encrypt(plain, password);
  const svc: ModelService = {
    id: 's1',
    name: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyCipher: cipher,
    enabled: true,
    enabledModels: ['claude-sonnet-4-6'],
    createdAt: new Date(),
  };
  await repo.create(svc);
  return svc;
};

describe('KeyVault', () => {
  let repo: IndexedDBModelServiceRepo;
  let vault: KeyVault;

  beforeEach(async () => {
    await resetDb();
    _resetKeyVaultForTests();
    repo = new IndexedDBModelServiceRepo();
    vault = new KeyVault(repo);
  });

  it('is locked by default', () => {
    expect(vault.unlocked).toBe(false);
  });

  it('rejects empty password on unlock', () => {
    expect(() => vault.unlock('')).toThrow(/empty/i);
  });

  it('decrypts a stored key after unlock', async () => {
    await seedService(repo, 'master', 'sk-secret');
    vault.unlock('master');
    expect(await vault.getApiKey('s1')).toBe('sk-secret');
  });

  it('caches decrypted keys for subsequent calls', async () => {
    await seedService(repo, 'master', 'sk-secret');
    vault.unlock('master');
    await vault.getApiKey('s1');
    // Delete from repo to prove cache is used
    await repo.delete('s1');
    expect(await vault.getApiKey('s1')).toBe('sk-secret');
  });

  it('throws if locked', async () => {
    await seedService(repo, 'master', 'sk-secret');
    await expect(vault.getApiKey('s1')).rejects.toThrow(/locked/i);
  });

  it('throws on wrong password (lazily, on first decrypt)', async () => {
    await seedService(repo, 'right', 'sk-secret');
    vault.unlock('wrong');
    await expect(vault.getApiKey('s1')).rejects.toThrow();
  });

  it('lock() clears cache and password', async () => {
    await seedService(repo, 'master', 'sk-secret');
    vault.unlock('master');
    await vault.getApiKey('s1');
    vault.lock();
    expect(vault.unlocked).toBe(false);
    await expect(vault.getApiKey('s1')).rejects.toThrow(/locked/i);
  });

  it('encryptForStorage round-trips with current password', async () => {
    vault.unlock('master');
    const cipher = await vault.encryptForStorage('new-key');
    const decrypted = await new CryptoService().decrypt(cipher, 'master');
    expect(decrypted).toBe('new-key');
  });

  it('encryptForStorage throws when locked', async () => {
    await expect(vault.encryptForStorage('x')).rejects.toThrow(/locked/i);
  });
});
