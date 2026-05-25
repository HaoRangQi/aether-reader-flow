/**
 * @fileoverview CryptoService — encrypts sensitive secrets at rest.
 *
 * Used for: encrypting user-provided AI API keys before persisting to
 * IndexedDB. The user supplies a master password; we derive a key from it
 * via PBKDF2 (SHA-256, 200k iterations) and AES-GCM-256 encrypt the
 * plaintext.
 *
 * ## Threat model
 *
 * - **Protects**: against another browser extension, a script injected
 *   from a third-party site, or someone copying IndexedDB files off disk,
 *   from reading API keys without the master password.
 * - **Does NOT protect**: against a compromised browser session (anyone
 *   with JavaScript execution in our origin can ask the user to type
 *   the password, or wait for them to unlock and snoop the unlocked
 *   in-memory key). Web crypto offers no hardware-backed key storage in
 *   the browser.
 * - **Future**: when we ship a Tauri desktop build (twoer phase), the
 *   master-password layer can be replaced by OS Keychain.
 *
 * ## Envelope format
 *
 * The output of `encrypt()` is a JSON string with three base64 fields:
 *
 *   { "v": 1, "salt": "...", "iv": "...", "ct": "..." }
 *
 * Different ciphertexts for the same plaintext (random salt + IV). The
 * envelope is round-tripped through IndexedDB as `apiKeyCipher` on the
 * `ModelService` record.
 */

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const AES_GCM_TAG_BYTES = 16;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function decodeEnvelopeB64(field: 'salt' | 'iv' | 'ct', value: string): Uint8Array {
  if (!BASE64_RE.test(value)) {
    throw new Error(`Invalid cipher envelope: ${field} must be valid base64`);
  }
  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(value);
  } catch {
    throw new Error(`Invalid cipher envelope: ${field} must be valid base64`);
  }
  if (bytesToB64(bytes) !== value) {
    throw new Error(`Invalid cipher envelope: ${field} must be canonical base64`);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // Web Crypto's PBKDF2 KDF accepts BufferSource. ArrayBufferView fits.
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface CipherEnvelope {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

interface ParsedCipherEnvelope {
  salt: Uint8Array;
  iv: Uint8Array;
  ct: Uint8Array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCipherEnvelope(envelope: string): ParsedCipherEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error('Invalid cipher envelope: expected JSON object');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid cipher envelope: expected JSON object');
  }
  if (typeof parsed.v !== 'number') {
    throw new Error('Invalid cipher envelope: v must be a number');
  }
  if (parsed.v !== 1) {
    throw new Error('Unsupported cipher envelope version');
  }
  if (typeof parsed.salt !== 'string') {
    throw new Error('Invalid cipher envelope: salt must be a base64 string');
  }
  if (typeof parsed.iv !== 'string') {
    throw new Error('Invalid cipher envelope: iv must be a base64 string');
  }
  if (typeof parsed.ct !== 'string') {
    throw new Error('Invalid cipher envelope: ct must be a base64 string');
  }

  const salt = decodeEnvelopeB64('salt', parsed.salt);
  const iv = decodeEnvelopeB64('iv', parsed.iv);
  const ct = decodeEnvelopeB64('ct', parsed.ct);

  if (salt.byteLength !== SALT_BYTES) {
    throw new Error(`Invalid cipher envelope: salt must be ${SALT_BYTES} bytes`);
  }
  if (iv.byteLength !== IV_BYTES) {
    throw new Error(`Invalid cipher envelope: iv must be ${IV_BYTES} bytes`);
  }
  if (ct.byteLength < AES_GCM_TAG_BYTES) {
    throw new Error(`Invalid cipher envelope: ct must be at least ${AES_GCM_TAG_BYTES} bytes`);
  }

  return { salt, iv, ct };
}

export class CryptoService {
  /**
   * Encrypt `plaintext` under `password`. Output is a JSON envelope.
   * Different ciphertexts on each call due to random IV.
   */
  async encrypt(plaintext: string, password: string): Promise<string> {
    if (password.length === 0) {
      throw new Error('Master password is required for encryption');
    }

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    );
    const envelope: CipherEnvelope = {
      v: 1,
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      ct: bytesToB64(new Uint8Array(ct)),
    };
    return JSON.stringify(envelope);
  }

  /**
   * Decrypt an envelope produced by `encrypt()`. Throws if the password
   * is wrong (AES-GCM authentication tag mismatch).
   */
  async decrypt(envelope: string, password: string): Promise<string> {
    const env = parseCipherEnvelope(envelope);
    const key = await deriveKey(password, env.salt);
    let pt: ArrayBuffer;
    try {
      pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: env.iv as BufferSource },
        key,
        env.ct as BufferSource,
      );
    } catch {
      throw new Error('Unable to decrypt cipher envelope: password or ciphertext is invalid');
    }
    return new TextDecoder().decode(pt);
  }
}
