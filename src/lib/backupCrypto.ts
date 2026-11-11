// Password-protected backups: XSalsa20-Poly1305 (tweetnacl secretbox), key from a salted, iterated SHA-512.
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';

const ITER = 30000;
const enc = new TextEncoder(), dec = new TextDecoder();

function deriveKey(pass: string, salt: Uint8Array, iter: number): Uint8Array {
  const p = enc.encode(pass);
  const seed = new Uint8Array(salt.length + p.length); seed.set(salt); seed.set(p, salt.length);
  let h = nacl.hash(seed);
  for (let i = 0; i < iter; i++) { const m = new Uint8Array(h.length + salt.length); m.set(h); m.set(salt, h.length); h = nacl.hash(m); }
  return h.slice(0, 32);
}

export const isEncryptedBackup = (p: any) => !!p && p.rpos_enc === 1 && typeof p.data === 'string';

export function encryptBackup(json: string, pass: string): string {
  const salt = Crypto.getRandomBytes(16), nonce = Crypto.getRandomBytes(24);
  const box = nacl.secretbox(enc.encode(json), nonce, deriveKey(pass, salt, ITER));
  return JSON.stringify({ rpos_enc: 1, kdf: 'sha512-iter', iter: ITER, salt: encodeBase64(salt), nonce: encodeBase64(nonce), data: encodeBase64(box) });
}

/** Returns the parsed backup object, or throws 'wrongBackupPassword'. */
export function decryptBackup(env: any, pass: string): any {
  try {
    const iter = Math.min(Math.max(Number(env.iter) || ITER, 1000), 200000);
    const key = deriveKey(pass, decodeBase64(env.salt), iter);
    const plain = nacl.secretbox.open(decodeBase64(env.data), decodeBase64(env.nonce), key);
    if (!plain) throw new Error('bad');
    return JSON.parse(dec.decode(plain));
  } catch { throw new Error('wrongBackupPassword'); }
}
