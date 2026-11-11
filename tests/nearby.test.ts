// NearbyTransport over a fake native bridge: chunking, reassembly across the base64 boundary, ordering, lifecycle.
import assert from 'node:assert/strict';
import { NearbyTransport, fromBase64, toBase64, type NativeNearby } from '../src/transport/nearby';

type L = (e: any) => void;
class FakeNative implements NativeNearby {
  ls: Record<string, L[]> = { onFrame: [], onPeer: [], onAuthDigits: [] };
  sent: { peerId: string; len: number }[] = []; peer?: FakeNative; started: string[] = []; maxLen = 0;
  async start(role: any) { this.started.push(role); }
  async connect() { return 'x'; }
  async send(peerId: string, d: string) { const n = fromBase64(d).length; this.maxLen = Math.max(this.maxLen, n); this.sent.push({ peerId, len: n }); const p = this.peer!; queueMicrotask(() => p.ls.onFrame.forEach((cb) => cb({ peerId: 'A', data: d }))); }
  async disconnect() {} async stop() {}
  addListener(ev: string, cb: L) { this.ls[ev].push(cb); return { remove: () => { this.ls[ev] = this.ls[ev].filter((x) => x !== cb); } }; }
}

for (const n of [0, 1, 2, 3, 4, 5, 100, 1000]) { const b = Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255); assert.deepEqual(fromBase64(toBase64(b)), b, `base64 len ${n}`); }
assert.equal(toBase64(new TextEncoder().encode('Man')), 'TWFu'); assert.equal(toBase64(new TextEncoder().encode('Ma')), 'TWE=');

async function main() {
  const a = new FakeNative(), b = new FakeNative(); a.peer = b; b.peer = a;
  const ta = new NearbyTransport(a, 1024), tb = new NearbyTransport(b, 1024);
  await ta.start('child', { serviceId: 's', name: 'a' }); await tb.start('parent', { serviceId: 's', name: 'b' });
  const got: Uint8Array[] = []; tb.onFrame((_, f) => got.push(f));
  const big = Uint8Array.from({ length: 50_000 }, (_, i) => (i * 13) & 255), small = new Uint8Array([1, 2, 3]);
  await ta.send('B', big); await ta.send('B', small); await Promise.all([ta.send('B', small), ta.send('B', big)]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(got.length, 4);
  assert.deepEqual(got[0], big); assert.deepEqual(got[1], small); assert.deepEqual(got[2], small); assert.deepEqual(got[3], big);
  assert.ok(a.maxLen <= 1024, 'no frame exceeds the configured limit');
  let peers: string[] = []; tb.onPeer((p, s) => peers.push(p + s)); b.ls.onPeer.forEach((cb) => cb({ peerId: 'A', state: 'connected' }));
  assert.deepEqual(peers, ['Aconnected']);
  await tb.stop(); assert.equal(b.ls.onFrame.length, 0, 'listeners detached on stop');
  console.log('nearby transport tests passed');
}
void main();
