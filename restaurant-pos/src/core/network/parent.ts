// Parent node: authoritative coordinator. Every event (from a Child or from the Parent's own UI) goes through ONE pipeline:
// dedupe -> network/device/signature checks -> state validation -> permission check -> sequence -> persist -> apply -> audit -> broadcast.
import type { Db } from '../../db/schema';
import type { Transport } from '../../transport/Transport';
import { buildEvent, signAsParent, verifyDeviceSig, type EntityType, type EventEnvelope, type EventType } from '../events';
import { permissionsOfDevice } from '../restaurant/store';
import { audit, getEventRow, insertEvent, kvGet, kvSet, maxSeq, rowToEvent, type EventRow } from '../restaurant/store';
import { applyEvent } from '../restaurant/projection';
import { validateEvent } from '../restaurant/validate';
import { BUILTIN_ROLES, ROLE_ADMIN } from '../permissions';
import { AppError, randomBytes, signObj, toHex, verifyObj, type Identity } from '../util';
import { HEARTBEAT_INTERVAL_MS, type Heartbeat } from './lease';
import { decodeMsg, encodeMsg, qrProof, type Certificate, type Msg, type PairingQr } from './protocol';

export interface ParentOpts {
  db: Db; transport: Transport; networkId: string; deviceId: string; keys: Identity;
  now?: () => number;
  /** Parent license state (from LicenseGate). Children only get heartbeats while this is valid. */
  license: () => { validUntil: number | null; allowChildren: boolean };
}
export interface Outcome { status: 'accepted' | 'rejected'; seq?: number; reason?: string; event?: EventEnvelope }
interface Session { peerId: string; deviceId?: string; pendingDeviceId?: string; challenge?: string; authed: boolean }
const BATCH = 40;

export class ParentNode {
  private sessions = new Map<string, Session>();
  private queue: Promise<unknown> = Promise.resolve();
  private frames: Promise<unknown> = Promise.resolve();   // frames from peers are handled strictly in arrival order
  private pairing: { nonce: string; expiresAt: number } | null = null;
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private now: () => number;

  constructor(private o: ParentOpts) { this.now = o.now ?? Date.now; }

  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private changed() { this.listeners.forEach((cb) => cb()); }

  /** Registers the Parent itself as the first device (event #1) on a fresh network. Safe to call again. */
  async bootstrap(restaurantName: string): Promise<void> {
    const have = await this.o.db.getFirstAsync('SELECT device_id FROM devices WHERE device_id = ?', [this.o.deviceId]);
    if (have) return;
    await this.submit('DEVICE_JOINED', 'device', this.o.deviceId, { name: 'Parent', roleId: ROLE_ADMIN, publicKey: this.o.keys.publicKey });
    await this.submit('SETTINGS_UPDATED', 'settings', 'settings', { restaurantName, currency: 'Rs', taxBps: 0 });
  }

  start(): void {
    this.unsubs.push(this.o.transport.onFrame((peerId, frame) => { this.frames = this.frames.then(() => this.onFrame(peerId, frame)).catch(() => undefined); }));
    this.unsubs.push(this.o.transport.onPeer((peerId, state) => { if (state === 'disconnected') { this.sessions.delete(peerId); this.changed(); } else if (!this.sessions.has(peerId)) this.sessions.set(peerId, { peerId, authed: false }); }));
    this.timer = setInterval(() => { void this.tick(); }, HEARTBEAT_INTERVAL_MS);
  }
  stop(): void { this.unsubs.forEach((u) => u()); this.unsubs = []; if (this.timer) clearInterval(this.timer); this.timer = null; }

  // ---------- pairing & device management (Parent UI) ----------
  openPairing(serviceId: string, endpointName: string, ttlMs = 10 * 60_000): PairingQr {
    this.pairing = { nonce: toHex(randomBytes(16)), expiresAt: this.now() + ttlMs };
    return { v: 1, networkId: this.o.networkId, parentDeviceId: this.o.deviceId, parentPublicKey: this.o.keys.publicKey, serviceId, endpointName, nonce: this.pairing.nonce, expiresAt: this.pairing.expiresAt };
  }
  closePairing(): void { this.pairing = null; }
  /** Name advertised over the transport; the pairing QR carries the same value. */
  get endpointName(): string { return `RPOS-${this.o.networkId.slice(0, 8)}`; }
  pendingDevices() { return this.o.db.getAllAsync<{ device_id: string; name: string; public_key: string; joined_at: number }>(`SELECT device_id, name, public_key, joined_at FROM devices WHERE status = 'pending'`); }
  connectedDeviceIds(): string[] { return [...this.sessions.values()].filter((s) => s.authed && s.deviceId).map((s) => s.deviceId!); }

  async approve(deviceId: string, name: string, roleId: string): Promise<void> {
    if (!this.o.license().allowChildren) throw new AppError('children_not_allowed');
    const d = await this.o.db.getFirstAsync<{ public_key: string; status: string }>('SELECT public_key, status FROM devices WHERE device_id = ?', [deviceId]);
    if (!d || d.status !== 'pending') throw new AppError('not_pending');
    if (!BUILTIN_ROLES[roleId] && !(await this.o.db.getFirstAsync('SELECT id FROM roles WHERE id = ?', [roleId]))) throw new AppError('unknown_role');
    const r = await this.submit('DEVICE_JOINED', 'device', deviceId, { name, roleId, publicKey: d.public_key });
    if (r.status !== 'accepted') throw new AppError(r.reason || 'rejected');
    const s = [...this.sessions.values()].find((x) => x.pendingDeviceId === deviceId);
    if (s) {
      const certificate: Certificate = { networkId: this.o.networkId, deviceId, publicKey: d.public_key, roleId, issuedAt: this.now() };
      await this.send(s.peerId, { t: 'ENROLL_APPROVED', certificate, certSig: signObj(this.o.keys.secretKey, certificate), parentPublicKey: this.o.keys.publicKey, parentDeviceId: this.o.deviceId });
      s.authed = true; s.deviceId = deviceId; s.pendingDeviceId = undefined;
      await this.send(s.peerId, await this.welcome(roleId));
    }
    this.changed();
  }
  async reject(deviceId: string, reason = 'rejected'): Promise<void> {
    await this.o.db.runAsync(`DELETE FROM devices WHERE device_id = ? AND status = 'pending'`, [deviceId]);
    const s = [...this.sessions.values()].find((x) => x.pendingDeviceId === deviceId);
    if (s) { await this.send(s.peerId, { t: 'ENROLL_REJECTED', reason }); await this.o.transport.disconnect(s.peerId).catch(() => {}); }
    this.changed();
  }
  async revoke(deviceId: string): Promise<void> {
    if (deviceId === this.o.deviceId) throw new AppError('cannot_revoke_parent');
    const r = await this.submit('DEVICE_REVOKED', 'device', deviceId, {});
    if (r.status !== 'accepted') throw new AppError(r.reason || 'rejected');
    for (const s of [...this.sessions.values()].filter((x) => x.deviceId === deviceId)) {
      await this.send(s.peerId, { t: 'REVOKED' });
      s.authed = false;
      await this.o.transport.disconnect(s.peerId).catch(() => {});
    }
  }
  async setRole(deviceId: string, roleId: string, name?: string): Promise<void> {
    const r = await this.submit('DEVICE_ROLE_UPDATED', 'device', deviceId, { roleId, name });
    if (r.status !== 'accepted') throw new AppError(r.reason || 'rejected');
  }

  // ---------- commands ----------
  /** The Parent's own commands use the same pipeline as Child events. */
  submit(type: EventType, entityType: EntityType, entityId: string, payload: Record<string, any>): Promise<Outcome> {
    const ev = buildEvent({ networkId: this.o.networkId, deviceId: this.o.deviceId, secretKey: this.o.keys.secretKey, type, entityType, entityId, payload, now: this.now() });
    return this.process(ev, null);
  }

  private process(ev: EventEnvelope, session: Session | null): Promise<Outcome> {
    const run = this.queue.then(() => this.processNow(ev, session));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async processNow(ev: EventEnvelope, session: Session | null): Promise<Outcome> {
    const db = this.o.db, at = this.now();
    if (!ev || typeof ev.eventId !== 'string' || typeof ev.deviceId !== 'string' || typeof ev.type !== 'string' || typeof ev.entityId !== 'string' || !ev.payload || typeof ev.payload !== 'object') return { status: 'rejected', reason: 'malformed' };
    // 1. duplicate protection: same event id -> same answer, no second effect
    const seen = await getEventRow(db, ev.eventId);
    if (seen) return outcomeOf(seen);

    const reject = async (reason: string): Promise<Outcome> => {
      await db.withTransactionAsync(async () => {
        await insertEvent(db, ev, 'rejected', false);
        await db.runAsync('UPDATE events SET reject_reason = ? WHERE event_id = ?', [reason, ev.eventId]);
        await audit(db, at, ev.deviceId, ev.eventId, ev.type, 'rejected', reason);
      });
      return { status: 'rejected', reason };
    };

    // 2. network, device, signature (remote only; the Parent trusts its own process)
    let perms: ReadonlySet<string>;
    if (session) {
      if (ev.networkId !== this.o.networkId) return reject('wrong_network');
      if (!session.authed || session.deviceId !== ev.deviceId) return reject('device_mismatch');
      const d = await db.getFirstAsync<{ public_key: string; status: string }>('SELECT public_key, status FROM devices WHERE device_id = ?', [ev.deviceId]);
      if (!d) return reject('unknown_device');
      if (d.status === 'revoked') return reject('device_revoked');
      if (d.status !== 'approved') return reject('device_not_authorized');
      if (!verifyDeviceSig(ev, d.public_key)) return reject('bad_signature');
      perms = await permissionsOfDevice(db, ev.deviceId);
    } else {
      perms = new Set(BUILTIN_ROLES[ROLE_ADMIN].permissions);
    }
    // 3. state validation (also decides which permission is required)
    const v = await validateEvent(db, ev, this.o.deviceId);
    if (!v.ok) return reject(v.reason);
    // 4. permission, enforced here and nowhere else in the UI path
    if (!perms.has(v.permission)) return reject('permission_denied');

    // 5. sequence + persist + apply atomically
    let signed!: EventEnvelope; let seq = 0;
    await db.withTransactionAsync(async () => {
      seq = (await maxSeq(db)) + 1;
      const meta: Record<string, any> = {};
      if (ev.type === 'ORDER_CREATED') {
        const n = Number((await kvGet(db, 'next_order_number')) ?? '1');
        meta.orderNumber = n; await kvSet(db, 'next_order_number', String(n + 1));
      }
      signed = signAsParent({ ...ev, seq, meta }, this.o.keys.secretKey);
      await insertEvent(db, signed, 'accepted', true);
      await applyEvent(db, signed);
      await audit(db, at, ev.deviceId, ev.eventId, ev.type, 'accepted', v.permission);
    });
    // 6. broadcast to every authenticated device (including the origin, which confirms its optimistic copy)
    await this.broadcast(signed);
    this.changed();
    return { status: 'accepted', seq, event: signed };
  }

  private async broadcast(e: EventEnvelope): Promise<void> {
    for (const s of this.sessions.values()) if (s.authed) await this.send(s.peerId, { t: 'EVENT', event: e });
  }

  // ---------- transport ----------
  private async send(peerId: string, m: Msg): Promise<void> {
    try { await this.o.transport.send(peerId, encodeMsg(m)); } catch { /* peer gone: it will resync on reconnect */ }
  }
  private async welcome(roleId: string): Promise<Msg> {
    return { t: 'WELCOME', lastSeq: await maxSeq(this.o.db), roleId, heartbeat: this.signedHeartbeat(await maxSeq(this.o.db)) };
  }
  private signedHeartbeat(lastSeq: number) {
    const hb: Heartbeat = { networkId: this.o.networkId, parentTime: this.now(), validUntil: this.o.license().validUntil, lastSeq };
    return { hb, sig: signObj(this.o.keys.secretKey, hb) };
  }
  /** Heartbeat carries the Parent's license validity. Not sent when the license is invalid or children are not allowed. */
  async tick(): Promise<void> {
    const lic = this.o.license();
    if (!lic.allowChildren || (lic.validUntil !== null && this.now() > lic.validUntil)) return;
    const hb = this.signedHeartbeat(await maxSeq(this.o.db));
    for (const s of this.sessions.values()) if (s.authed) await this.send(s.peerId, { t: 'HEARTBEAT', heartbeat: hb });
  }

  private async onFrame(peerId: string, frame: Uint8Array): Promise<void> {
    const m = decodeMsg(frame); if (!m) return;
    let s = this.sessions.get(peerId);
    if (!s) { s = { peerId, authed: false }; this.sessions.set(peerId, s); }
    const db = this.o.db;
    switch (m.t) {
      case 'HELLO': {
        if (m.networkId !== this.o.networkId) { await this.send(peerId, { t: 'ERROR', code: 'wrong_network' }); return; }
        const d = await db.getFirstAsync<{ public_key: string; status: string }>('SELECT public_key, status FROM devices WHERE device_id = ?', [m.deviceId]);
        if (!d) {
          if (!this.o.license().allowChildren) { await this.send(peerId, { t: 'ENROLL_REJECTED', reason: 'children_not_allowed' }); return; }
          const p = this.pairing;
          if (!p || this.now() > p.expiresAt || m.qrProof !== qrProof(p.nonce, m.deviceId, m.publicKey)) { await this.send(peerId, { t: 'ENROLL_REJECTED', reason: 'bad_or_expired_qr' }); return; }
          await db.runAsync(`INSERT INTO devices (device_id, name, role_id, public_key, status, joined_at) VALUES (?,?,NULL,?,'pending',?)`, [m.deviceId, m.name, m.publicKey, this.now()]);
          s.pendingDeviceId = m.deviceId; await this.send(peerId, { t: 'ENROLL_PENDING' }); this.changed(); return;
        }
        if (d.public_key !== m.publicKey) { await this.send(peerId, { t: 'ERROR', code: 'key_mismatch' }); return; }
        if (d.status === 'revoked') { await this.send(peerId, { t: 'REVOKED' }); await this.o.transport.disconnect(peerId).catch(() => {}); return; }
        if (d.status === 'pending') { s.pendingDeviceId = m.deviceId; await this.send(peerId, { t: 'ENROLL_PENDING' }); return; }
        s.deviceId = m.deviceId; s.challenge = toHex(randomBytes(16));
        await this.send(peerId, { t: 'CHALLENGE', nonce: s.challenge }); return;
      }
      case 'AUTH': {
        if (!s.deviceId || !s.challenge) return;
        const d = await db.getFirstAsync<{ public_key: string; status: string; role_id: string }>('SELECT public_key, status, role_id FROM devices WHERE device_id = ?', [s.deviceId]);
        if (!d || d.status !== 'approved' || !verifyObj(d.public_key, { nonce: s.challenge, networkId: this.o.networkId, deviceId: s.deviceId }, m.signature)) {
          await this.send(peerId, { t: 'ERROR', code: 'auth_failed' }); await this.o.transport.disconnect(peerId).catch(() => {}); return;
        }
        s.authed = true; s.challenge = undefined;
        await this.send(peerId, await this.welcome(d.role_id)); this.changed(); return;
      }
      case 'SYNC_REQUEST': {
        if (!s.authed) return;
        const rows = await db.getAllAsync<EventRow>(`SELECT * FROM events WHERE seq > ? ORDER BY seq`, [m.afterSeq]);
        for (let i = 0; i < rows.length; i += BATCH) await this.send(peerId, { t: 'EVENTS', events: rows.slice(i, i + BATCH).map(rowToEvent) });
        return;
      }
      case 'EVENT': {
        if (!s.authed) { await this.send(peerId, { t: 'EVENT_RESULT', eventId: m.event?.eventId ?? '', status: 'rejected', reason: 'not_authenticated' }); return; }
        const r = await this.process(m.event, s);
        await this.send(peerId, { t: 'EVENT_RESULT', eventId: m.event.eventId, status: r.status, seq: r.seq, reason: r.reason });
        return;
      }
      case 'APPLIED': if (s.authed && s.deviceId) await kvSet(db, `applied:${s.deviceId}`, String(m.seq)); return;
      default: return;
    }
  }
}

function outcomeOf(r: EventRow): Outcome {
  return r.state === 'rejected' ? { status: 'rejected', reason: r.reject_reason } : { status: 'accepted', seq: r.seq ?? undefined, event: rowToEvent(r) };
}
