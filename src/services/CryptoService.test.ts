import { describe, it, expect } from 'vitest';
import { CryptoService } from './CryptoService';

describe('CryptoService', () => {
  const svc = new CryptoService();

  async function envelopeWith(overrides: Record<string, unknown>): Promise<string> {
    const env = JSON.parse(await svc.encrypt('secret', 'p'));
    return JSON.stringify({ ...env, ...overrides });
  }

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
    await expect(svc.decrypt(cipher, 'wrong')).rejects.toThrow(
      'Unable to decrypt cipher envelope: password or ciphertext is invalid',
    );
  });

  it('throws on truncated envelope', async () => {
    await expect(svc.decrypt('not-json', 'p')).rejects.toThrow(
      'Invalid cipher envelope: expected JSON object',
    );
  });

  it('throws on malformed envelope structure', async () => {
    await expect(svc.decrypt(JSON.stringify([]), 'p')).rejects.toThrow(
      'Invalid cipher envelope: expected JSON object',
    );
    await expect(svc.decrypt(await envelopeWith({ salt: 42 }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: salt must be a base64 string',
    );
    await expect(svc.decrypt(await envelopeWith({ iv: null }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: iv must be a base64 string',
    );
    await expect(svc.decrypt(await envelopeWith({ ct: false }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: ct must be a base64 string',
    );
  });

  it('throws on unsupported envelope version', async () => {
    await expect(svc.decrypt(await envelopeWith({ v: 2 }), 'p')).rejects.toThrow(
      'Unsupported cipher envelope version',
    );
  });

  it('throws on invalid base64 fields', async () => {
    await expect(svc.decrypt(await envelopeWith({ ct: 'not base64!' }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: ct must be valid base64',
    );
  });

  it('throws on non-canonical base64 fields', async () => {
    await expect(svc.decrypt(await envelopeWith({ ct: '/x==' }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: ct must be canonical base64',
    );
  });

  it('throws on wrong salt or IV length', async () => {
    await expect(svc.decrypt(await envelopeWith({ salt: btoa('short') }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: salt must be 16 bytes',
    );
    await expect(svc.decrypt(await envelopeWith({ iv: btoa('short') }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: iv must be 12 bytes',
    );
  });

  it('throws on ciphertext shorter than the AES-GCM tag', async () => {
    await expect(svc.decrypt(await envelopeWith({ ct: btoa('short') }), 'p')).rejects.toThrow(
      'Invalid cipher envelope: ct must be at least 16 bytes',
    );
  });

  it('rejects an empty master password when encrypting', async () => {
    await expect(svc.encrypt('secret', '')).rejects.toThrow(
      'Master password is required for encryption',
    );
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
