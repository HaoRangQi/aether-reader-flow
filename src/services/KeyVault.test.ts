import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '@/adapters/storage/db';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { CryptoService } from './CryptoService';
import { KeyVault, _resetKeyVaultForTests } from './KeyVault';
import type { ModelService } from '@/types/domain';
import type { ModelServiceRepo } from '@/adapters/storage/interfaces';

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
    window.sessionStorage.clear();
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

  it('rejects decrypted blank API keys without caching them', async () => {
    await seedService(repo, 'master', '   ');
    vault.unlock('master');

    await expect(vault.getApiKey('s1')).rejects.toThrow(/no API key configured/i);

    await repo.update('s1', {
      apiKeyCipher: await new CryptoService().encrypt('sk-restored', 'master'),
    });
    await expect(vault.getApiKey('s1')).resolves.toBe('sk-restored');
  });

  it('lock() clears cache and password', async () => {
    await seedService(repo, 'master', 'sk-secret');
    vault.unlock('master');
    await vault.getApiKey('s1');
    vault.lock();
    expect(vault.unlocked).toBe(false);
    await expect(vault.getApiKey('s1')).rejects.toThrow(/locked/i);
  });

  it('does not return or cache a stale key when re-unlocked during an in-flight lookup', async () => {
    const svc = await seedService(repo, 'master', 'sk-secret');
    let resolveGet: (service: ModelService | null) => void = () => {};
    const pendingGet = new Promise<ModelService | null>((resolve) => {
      resolveGet = resolve;
    });
    const slowRepo: ModelServiceRepo = {
      create: async () => {},
      get: async () => pendingGet,
      list: async () => [],
      update: async () => {},
      delete: async () => {},
    };
    const slowVault = new KeyVault(slowRepo);

    slowVault.unlock('master');
    const apiKey = slowVault.getApiKey('s1');
    slowVault.unlock('master');
    resolveGet(svc);

    await expect(apiKey).rejects.toThrow(/locked/i);
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

  it('encryptForStorage rejects blank API keys', async () => {
    vault.unlock('master');
    await expect(vault.encryptForStorage('  \n\t')).rejects.toThrow(
      /no API key configured/i,
    );
  });

  it('restores unlocked state from sessionStorage after creating a new vault instance', async () => {
    await seedService(repo, 'master', 'sk-secret');

    vault.unlock('master');

    const nextVault = new KeyVault(repo);
    expect(nextVault.unlocked).toBe(true);
    await expect(nextVault.getApiKey('s1')).resolves.toBe('sk-secret');
  });

  it('lock clears sessionStorage so a new instance starts locked', async () => {
    vault.unlock('master');
    expect(window.sessionStorage.getItem('aether:key-vault:master-password')).toBe('master');

    vault.lock();
    expect(window.sessionStorage.getItem('aether:key-vault:master-password')).toBeNull();

    const nextVault = new KeyVault(repo);
    expect(nextVault.unlocked).toBe(false);
  });
});
