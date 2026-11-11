// In-memory transport for tests: lets Parent/Child nodes talk without radios, with controllable failures.
import type { PeerState, Transport, Unsub } from './Transport';

export class MemoryNetwork {
  private parents = new Map<string, MemoryTransport>();
  /** When true, frames are silently lost (simulates a dropped link without a disconnect event). */
  dropFrames = false;
  /** Frames delivered so far (for assertions). */
  delivered = 0;
  register(name: string, t: MemoryTransport) { this.parents.set(name, t); }
  find(name: string) { return this.parents.get(name); }
  create(): MemoryTransport { return new MemoryTransport(this); }
}

export class MemoryTransport implements Transport {
  private frameCbs = new Set<(p: string, f: Uint8Array) => void>();
  private peerCbs = new Set<(p: string, s: PeerState) => void>();
  private links = new Map<string, MemoryTransport>();   // peerId -> remote
  private role: 'parent' | 'child' | null = null;
  private name = '';
  readonly id: string;
  private static counter = 0;
  constructor(private net: MemoryNetwork) { this.id = `mem-${++MemoryTransport.counter}`; }

  async start(role: 'parent' | 'child', opts: { serviceId: string; name: string }) {
    this.role = role; this.name = opts.name;
    if (role === 'parent') this.net.register(opts.name, this);
  }
  async stop() { for (const p of [...this.links.keys()]) await this.disconnect(p); }
  async connect(endpointName: string) {
    const parent = this.net.find(endpointName);
    if (!parent || this.role !== 'child') throw new Error('endpoint_not_found');
    this.links.set(parent.id, parent); parent.links.set(this.id, this);
    this.emitPeer(parent.id, 'connected'); parent.emitPeer(this.id, 'connected');
  }
  async send(peerId: string, frame: Uint8Array) {
    const remote = this.links.get(peerId); if (!remote) throw new Error('not_connected');
    if (this.net.dropFrames) return;
    const copy = frame.slice();
    this.net.delivered++;
    queueMicrotask(() => remote.frameCbs.forEach((cb) => cb(this.id, copy)));
  }
  async disconnect(peerId: string) {
    const remote = this.links.get(peerId); if (!remote) return;
    this.links.delete(peerId); remote.links.delete(this.id);
    this.emitPeer(peerId, 'disconnected'); remote.emitPeer(this.id, 'disconnected');
  }
  onFrame(cb: (p: string, f: Uint8Array) => void): Unsub { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); }
  onPeer(cb: (p: string, s: PeerState) => void): Unsub { this.peerCbs.add(cb); return () => this.peerCbs.delete(cb); }
  private emitPeer(peerId: string, s: PeerState) { this.peerCbs.forEach((cb) => cb(peerId, s)); }
  get advertisedName() { return this.name; }
  peers() { return [...this.links.keys()]; }
}
