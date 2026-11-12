// Pure helpers shared by core modules (no Expo imports: runs under Node tests and in the app).
import nacl from 'tweetnacl';

export class AppError extends Error {
  constructor(public code: string, message?: string) { super(message || code); this.name = 'AppError'; }
}

let rng: (n: number) => Uint8Array = (n) => nacl.randomBytes(n);
/** The app injects expo-crypto's generator at startup (tweetnacl has no PRNG in React Native). */
export function setRandomBytes(fn: (n: number) => Uint8Array): void { rng = fn; }
export const randomBytes = (n: number): Uint8Array => rng(n);

export function toHex(b: Uint8Array): string { let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s; }
export function fromHex(s: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})*$/.test(s)) throw new AppError('bad_hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** UUID v4 (random). */
export function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Deterministic JSON (sorted keys, undefined dropped) used for every signature. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

const enc = new TextEncoder();
export interface Identity { publicKey: string; secretKey: string }
export function newIdentity(): Identity {
  const kp = nacl.sign.keyPair.fromSeed(randomBytes(32));
  return { publicKey: toHex(kp.publicKey), secretKey: toHex(kp.secretKey) };
}
export function signObj(secretKeyHex: string, obj: unknown): string {
  return toHex(nacl.sign.detached(enc.encode(canonical(obj)), fromHex(secretKeyHex)));
}
export function verifyObj(publicKeyHex: string, obj: unknown, sigHex: string): boolean {
  try { return nacl.sign.detached.verify(enc.encode(canonical(obj)), fromHex(sigHex), fromHex(publicKeyHex)); } catch { return false; }
}
export const sha512Hex = (s: string): string => toHex(nacl.hash(enc.encode(s)));
