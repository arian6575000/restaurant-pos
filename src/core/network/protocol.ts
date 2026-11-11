// Wire protocol between Parent and Child devices. Transport-agnostic: messages are JSON bytes.
import type { EventEnvelope } from '../events';
import { sha512Hex } from '../util';
import type { Heartbeat } from './lease';

export interface Certificate { networkId: string; deviceId: string; publicKey: string; roleId: string; issuedAt: number }

export type Msg =
  | { t: 'HELLO'; networkId: string; deviceId: string; publicKey: string; name: string; qrProof?: string }
  | { t: 'CHALLENGE'; nonce: string }
  | { t: 'AUTH'; signature: string }
  | { t: 'ENROLL_PENDING' }
  | { t: 'ENROLL_APPROVED'; certificate: Certificate; certSig: string; parentPublicKey: string; parentDeviceId: string }
  | { t: 'ENROLL_REJECTED'; reason: string }
  | { t: 'WELCOME'; lastSeq: number; roleId: string; heartbeat: SignedHeartbeat }
  | { t: 'HEARTBEAT'; heartbeat: SignedHeartbeat }
  | { t: 'EVENT'; event: EventEnvelope }
  | { t: 'EVENTS'; events: EventEnvelope[] }
  | { t: 'EVENT_RESULT'; eventId: string; status: 'accepted' | 'rejected'; seq?: number; reason?: string }
  | { t: 'SYNC_REQUEST'; afterSeq: number }
  | { t: 'APPLIED'; seq: number }
  | { t: 'REVOKED' }
  | { t: 'ERROR'; code: string };

export interface SignedHeartbeat { hb: Heartbeat; sig: string }

const enc = new TextEncoder(), dec = new TextDecoder();
export const encodeMsg = (m: Msg): Uint8Array => enc.encode(JSON.stringify(m));
export function decodeMsg(b: Uint8Array): Msg | null {
  try { const m = JSON.parse(dec.decode(b)); return m && typeof m.t === 'string' ? (m as Msg) : null; } catch { return null; }
}

/** QR shown by the Parent. Contains no secret: the nonce only proves the Child saw the QR; the operator still approves. */
export interface PairingQr {
  v: 1; networkId: string; parentDeviceId: string; parentPublicKey: string;
  serviceId: string; endpointName: string; nonce: string; expiresAt: number;
}
export const qrProof = (nonce: string, deviceId: string, publicKey: string): string => sha512Hex(`${nonce}|${deviceId}|${publicKey}`);
export const encodeQr = (q: PairingQr): string => JSON.stringify(q);
export function decodeQr(s: string): PairingQr | null {
  try {
    const q = JSON.parse(s);
    if (q?.v === 1 && q.networkId && q.parentPublicKey && q.endpointName && q.nonce && q.serviceId && typeof q.expiresAt === 'number') return q as PairingQr;
  } catch { /* not ours */ }
  return null;
}
export const backoffMs = (attempts: number): number => Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
