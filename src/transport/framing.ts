// Message framing for transports with a payload size limit (Nearby BYTES payloads are size-limited).
// Frame layout: 1 byte version | 16 bytes message id | 2 bytes chunk index | 2 bytes chunk count | data.
const HEADER = 21;

export function splitFrames(data: Uint8Array, maxBytes: number, messageId: Uint8Array): Uint8Array[] {
  if (messageId.length !== 16) throw new Error('messageId must be 16 bytes');
  const room = maxBytes - HEADER;
  if (room <= 0) throw new Error('maxBytes too small');
  const count = Math.max(1, Math.ceil(data.length / room));
  if (count > 65535) throw new Error('message too large');
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const part = data.subarray(i * room, Math.min(data.length, (i + 1) * room));
    const f = new Uint8Array(HEADER + part.length);
    f[0] = 1; f.set(messageId, 1);
    f[17] = i >> 8; f[18] = i & 255; f[19] = count >> 8; f[20] = count & 255;
    f.set(part, HEADER);
    out.push(f);
  }
  return out;
}

export class Reassembler {
  private parts = new Map<string, { count: number; got: Map<number, Uint8Array>; at: number }>();
  constructor(private ttlMs = 60_000) {}
  /** Returns the full message when the last chunk arrives, otherwise null. Duplicate chunks are ignored. */
  push(frame: Uint8Array, now = Date.now()): Uint8Array | null {
    if (frame.length < HEADER || frame[0] !== 1) return null;
    this.expire(now);
    const id = Array.from(frame.subarray(1, 17)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const idx = (frame[17] << 8) | frame[18], count = (frame[19] << 8) | frame[20];
    if (count === 0 || idx >= count) return null;
    let m = this.parts.get(id);
    if (!m) { m = { count, got: new Map(), at: now }; this.parts.set(id, m); }
    m.got.set(idx, frame.slice(HEADER));
    if (m.got.size < m.count) return null;
    this.parts.delete(id);
    let len = 0; for (const p of m.got.values()) len += p.length;
    const out = new Uint8Array(len); let o = 0;
    for (let i = 0; i < m.count; i++) { const p = m.got.get(i)!; out.set(p, o); o += p.length; }
    return out;
  }
  private expire(now: number) { for (const [k, v] of this.parts) if (now - v.at > this.ttlMs) this.parts.delete(k); }
}
