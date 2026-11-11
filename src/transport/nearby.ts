// Transport implementation on top of the native Nearby Connections bridge (modules/nearby-connections).
// Adds framing so messages larger than a single Nearby BYTES payload are split and reassembled per peer.
import type { PeerState, Transport, Unsub } from './Transport';
import { Reassembler, splitFrames } from './framing';
import { randomBytes } from '../core/util';

/** What the native module must provide (see modules/nearby-connections/src/index.ts). */
export interface NativeNearby {
  start(role: 'parent' | 'child', serviceId: string, name: string): Promise<void>;
  connect(endpointName: string, timeoutMs: number): Promise<string>;
  send(peerId: string, dataBase64: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onFrame', cb: (e: { peerId: string; data: string }) => void): { remove(): void };
  addListener(event: 'onPeer', cb: (e: { peerId: string; state: PeerState }) => void): { remove(): void };
  addListener(event: 'onAuthDigits', cb: (e: { peerId: string; digits: string }) => void): { remove(): void };
}

/** Conservative chunk size, well below Nearby's BYTES limit (the exact limit is unverified on hardware). */
export const MAX_FRAME_BYTES = 16 * 1024;
export const CONNECT_TIMEOUT_MS = 20_000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(b: Uint8Array): string {
  let o = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    o += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return o;
}
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export class NearbyTransport implements Transport {
  private frameCbs = new Set<(p: string, f: Uint8Array) => void>();
  private peerCbs = new Set<(p: string, s: PeerState) => void>();
  private digitCbs = new Set<(p: string, d: string) => void>();
  private subs: { remove(): void }[] = [];
  private re = new Map<string, Reassembler>();
  private sendChain = new Map<string, Promise<unknown>>();

  constructor(private native: NativeNearby, private maxFrame = MAX_FRAME_BYTES, private ensurePermissions: () => Promise<void> = async () => {}) {}

  async start(role: 'parent' | 'child', opts: { serviceId: string; name: string }): Promise<void> {
    await this.ensurePermissions();
    this.detach();
    this.subs.push(
      this.native.addListener('onFrame', (e) => {
        let r = this.re.get(e.peerId); if (!r) { r = new Reassembler(); this.re.set(e.peerId, r); }
        const msg = r.push(fromBase64(e.data));
        if (msg) this.frameCbs.forEach((cb) => cb(e.peerId, msg));
      }),
      this.native.addListener('onPeer', (e) => { if (e.state === 'disconnected') { this.re.delete(e.peerId); this.sendChain.delete(e.peerId); } this.peerCbs.forEach((cb) => cb(e.peerId, e.state)); }),
      this.native.addListener('onAuthDigits', (e) => this.digitCbs.forEach((cb) => cb(e.peerId, e.digits))),
    );
    await this.native.start(role, opts.serviceId, opts.name);
  }
  async stop(): Promise<void> { await this.native.stop(); this.detach(); this.re.clear(); this.sendChain.clear(); }
  private detach() { this.subs.forEach((s) => s.remove()); this.subs = []; }

  async connect(endpointName: string): Promise<void> { await this.native.connect(endpointName, CONNECT_TIMEOUT_MS); }

  /** Frames to one peer are sent strictly one after another so chunks of different messages never interleave out of order. */
  send(peerId: string, message: Uint8Array): Promise<void> {
    const frames = splitFrames(message, this.maxFrame, randomBytes(16));
    const prev = this.sendChain.get(peerId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => { for (const f of frames) await this.native.send(peerId, toBase64(f)); });
    this.sendChain.set(peerId, run);
    return run as Promise<void>;
  }
  disconnect(peerId: string): Promise<void> { return this.native.disconnect(peerId); }
  onFrame(cb: (p: string, f: Uint8Array) => void): Unsub { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); }
  onPeer(cb: (p: string, s: PeerState) => void): Unsub { this.peerCbs.add(cb); return () => this.peerCbs.delete(cb); }
  onAuthDigits(cb: (p: string, d: string) => void): Unsub { this.digitCbs.add(cb); return () => this.digitCbs.delete(cb); }
}
