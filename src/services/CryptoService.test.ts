import { describe, it, expect } from 'vitest';
import { CryptoService } from './CryptoService';

describe('CryptoService', () => {
  const svc = new CryptoService();

  it('round-trips encrypt → decrypt with the master password', async () => {
    const cipher = await svc.encrypt('sk-ant-secret-key', 'master-pass');
    expect(cipher).not.toContain('sk-ant-secret-key');
    const plain = await svc.decrypt(cipher, 'master-pass');
    expect(plain).toBe('sk-ant-secret-key');
  });

  it('produces different ciphertexts for identical plaintexts (random IV/salt)', async () => {
    const a = await svc.encrypt('x', 'p');
    const b = await svc.encrypt('x', 'p');
    expect(a).not.toBe(b);
  });

  it('throws on wrong password (AES-GCM auth tag mismatch)', async () => {
    const cipher = await svc.encrypt('secret', 'right');
    await expect(svc.decrypt(cipher, 'wrong')).rejects.toThrow();
  });

  it('throws on truncated envelope', async () => {
    await expect(svc.decrypt('not-json', 'p')).rejects.toThrow();
  });

  it('emits a v1 envelope with salt/iv/ct base64 fields', async () => {
    const cipher = await svc.encrypt('hello', 'p');
    const env = JSON.parse(cipher);
    expect(env.v).toBe(1);
    expect(typeof env.salt).toBe('string');
    expect(typeof env.iv).toBe('string');
    expect(typeof env.ct).toBe('string');
  });

  it('handles unicode plaintext', async () => {
    const cipher = await svc.encrypt('中文密钥 🔑', 'pw');
    expect(await svc.decrypt(cipher, 'pw')).toBe('中文密钥 🔑');
  });
});
