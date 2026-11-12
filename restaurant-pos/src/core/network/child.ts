// Child node: works offline against a local replica, queues its own events, and treats the Parent as the authority.
// A local write is NOT proof of delivery: an event is only final once the Parent has sequenced it and broadcast it back.
import type { Db } from '../../db/schema';
import type { Transport } from '../../transport/Transport';
import { buildEvent, verifyParentSig, type EntityType, type EventEnvelope, type EventType } from '../events';
import { customRoles, getEventRow, insertEvent, kvGet, kvJson, kvSet, rowToEvent, type EventRow } from '../restaurant/store';
import { applyEvent, revertEvent } from '../restaurant/projection';
import { validateEvent } from '../restaurant/validate';
import { permissionsOfRole, type Permission } from '../permissions';
import { AppError, signObj, verifyObj, type Identity } from '../util';
import { evaluateLease, leaseFrom, type LeaseRecord, type LeaseStatus } from './lease';
import { backoffMs, decodeMsg, encodeMsg, qrProof, type Msg, type PairingQr, type SignedHeartbeat } from './protocol';

export interface ChildOpts { db: Db; transport: Transport; deviceId: string; keys: Identity; deviceName: string; now?: () => number }
export type Membership = 'none' | 'enrolling' | 'waiting' | 'active' | 'rejected' | 'revoked';
export interface ChildStatus { membership: Membership; error: string; connected: boolean; authed: boolean; lease: LeaseStatus; pendingEvents: number; lastSeq: number }

/** Minimum permission each event type needs on the Child (the Parent re-checks with its own registry; this only gives fast feedback). */
export class ChildNode {
  private peer: string | null = null;
  private authed = false;
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private lastResyncAt = 0;
  private now: () => number;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private o: ChildOpts) { this.now = o.now ?? Date.now; }
  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private changed() { this.listeners.forEach((cb) => cb()); }
  /** Handlers run one at a time so SQLite transactions never overlap. */
  private serial<T>(fn: () => Promise<T>): Promise<T> { const r = this.chain.then(fn); this.chain = r.catch(() => undefined); return r; }

  start(): void {
    this.unsubs.push(this.o.transport.onFrame((_p, f) => { void this.serial(() => this.onFrame(f)); }));
    this.unsubs.push(this.o.transport.onPeer((p, s) => { void this.serial(() => this.onPeer(p, s)); }));
  }
  stop(): void { this.unsubs.forEach((u) => u()); this.unsubs = []; }

  // ---------- enrollment ----------
  /** Called with the scanned Parent QR. Starts discovery/connection; HELLO is sent when the link is up. */
  async join(qr: PairingQr): Promise<void> {
    if (this.now() > qr.expiresAt) throw new AppError('qr_expired');
    await kvSet(this.o.db, 'mode', 'child');
    await kvSet(this.o.db, 'network_id', qr.networkId);
    await kvSet(this.o.db, 'parent_device_id', qr.parentDeviceId);
    await kvSet(this.o.db, 'parent_public_key', qr.parentPublicKey);
    await kvSet(this.o.db, 'parent_endpoint', qr.endpointName);
    await kvSet(this.o.db, 'pairing', JSON.stringify({ nonce: qr.nonce, serviceId: qr.serviceId }));
    await kvSet(this.o.db, 'membership', 'enrolling');
    await this.link(qr.serviceId, qr.endpointName);
  }
  /** Last connection problem (not found, permission, Bluetooth off...). Cleared when a link is up. */
  lastError = '';
  private async link(serviceId: string, endpoint: string): Promise<void> {
    try { await this.o.transport.start('child', { serviceId, name: this.o.deviceName }); await this.o.transport.connect(endpoint); this.lastError = ''; }
    catch (e: any) { this.lastError = String(e?.code ?? e?.message ?? e); }   // the periodic reconnect keeps trying
    this.changed();
  }
  /** Reconnect to the known Parent (after restart or link loss). */
  async reconnect(): Promise<void> {
    const ep = await kvGet(this.o.db, 'parent_endpoint'); const pair = await kvJson<{ serviceId: string }>(this.o.db, 'pairing');
    if (!ep || !pair || (await this.membership()) === 'revoked') return;
    await this.link(pair.serviceId, ep);
  }

  async membership(): Promise<Membership> { return ((await kvGet(this.o.db, 'membership')) as Membership) ?? 'none'; }

  // ---------- commands ----------
  async permissions(): Promise<ReadonlySet<Permission>> {
    return permissionsOfRole(await kvGet(this.o.db, 'role_id'), await customRoles(this.o.db));
  }
  async leaseStatus(): Promise<LeaseStatus> {
    const lease = await kvJson<LeaseRecord>(this.o.db, 'lease');
    const last = Number((await kvGet(this.o.db, 'lease_last_seen')) ?? '0');
    const now = this.now();
    const st = evaluateLease(lease, now, last);
    if (st !== 'clock') await kvSet(this.o.db, 'lease_last_seen', String(Math.max(now, last)));
    return st;
  }

  /** Records an event locally (optimistic) and queues it for the Parent. Throws if the Child may not act. */
  submit(type: EventType, entityType: EntityType, entityId: string, payload: Record<string, any>): Promise<EventEnvelope> {
    return this.serial(async () => {
      const db = this.o.db;
      if ((await this.membership()) !== 'active') throw new AppError('not_enrolled');
      const lease = await this.leaseStatus();
      if (lease !== 'ok') throw new AppError(`lease_${lease}`);
      const networkId = (await kvGet(db, 'network_id'))!;
      const ev = buildEvent({ networkId, deviceId: this.o.deviceId, secretKey: this.o.keys.secretKey, type, entityType, entityId, payload, now: this.now() });
      const v = await validateEvent(db, ev, (await kvGet(db, 'parent_device_id')) ?? '');
      if (!v.ok) throw new AppError(v.reason);
      if (!(await this.permissions()).has(v.permission)) throw new AppError('permission_denied');
      await db.withTransactionAsync(async () => { await insertEvent(db, ev, 'pending', true); await applyEvent(db, ev); });
      this.changed();
      void this.flushNow(true);
      return ev;
    });
  }

  // ---------- delivery ----------
  private async send(m: Msg): Promise<boolean> {
    if (!this.peer) return false;
    try { await this.o.transport.send(this.peer, encodeMsg(m)); return true; } catch { return false; }
  }
  private flushNow(force: boolean): Promise<void> { return this.serial(() => this.flush(force)); }
  private async flush(force: boolean): Promise<void> {
    if (!this.authed) return;
    const now = this.now();
    const rows = await this.o.db.getAllAsync<EventRow>(
      `SELECT * FROM events WHERE device_id = ? AND state IN ('pending','sent') ${force ? '' : 'AND next_try_at <= ?'} ORDER BY created_at, rowid`,
      force ? [this.o.deviceId] : [this.o.deviceId, now]);
    for (const r of rows) {
      if (await this.send({ t: 'EVENT', event: rowToEvent(r) })) {
        await this.o.db.runAsync(`UPDATE events SET state = 'sent', attempts = attempts + 1, next_try_at = ? WHERE event_id = ? AND state IN ('pending','sent')`,
          [now + backoffMs(r.attempts + 1), r.event_id]);
      }
    }
  }
  /** Call periodically (app timer): retries due events and reconnects when the link is down. */
  async tick(): Promise<void> {
    if (this.authed) { await this.flushNow(false); return; }
    if (!this.peer && (await this.membership()) === 'active') { try { await this.reconnect(); } catch { /* try again next tick */ } }
  }

  async status(): Promise<ChildStatus> {
    const n = await this.o.db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM events WHERE device_id = ? AND state IN ('pending','sent')`, [this.o.deviceId]);
    return {
      membership: await this.membership(), connected: !!this.peer, authed: this.authed, lease: await this.leaseStatus(),
      pendingEvents: n?.c ?? 0, error: this.lastError, lastSeq: Number((await kvGet(this.o.db, 'last_seq')) ?? '0'),
    };
  }

  // ---------- incoming ----------
  private async onPeer(peerId: string, state: string): Promise<void> {
    if (state === 'connected') {
      this.peer = peerId; this.authed = false;
      const db = this.o.db;
      const pair = await kvJson<{ nonce: string }>(db, 'pairing');
      const m = await this.membership();
      await this.send({
        t: 'HELLO', networkId: (await kvGet(db, 'network_id')) ?? '', deviceId: this.o.deviceId, publicKey: this.o.keys.publicKey, name: this.o.deviceName,
        qrProof: m === 'enrolling' && pair ? qrProof(pair.nonce, this.o.deviceId, this.o.keys.publicKey) : undefined,
      });
    } else if (state === 'disconnected' && peerId === this.peer) { this.peer = null; this.authed = false; }
    this.changed();
  }

  private async onFrame(frame: Uint8Array): Promise<void> {
    const m = decodeMsg(frame); if (!m) return;
    const db = this.o.db;
    switch (m.t) {
      case 'CHALLENGE': {
        const networkId = (await kvGet(db, 'network_id')) ?? '';
        await this.send({ t: 'AUTH', signature: signObj(this.o.keys.secretKey, { nonce: m.nonce, networkId, deviceId: this.o.deviceId }) }); return;
      }
      case 'ENROLL_PENDING': await kvSet(db, 'membership', 'waiting'); break;
      case 'ENROLL_REJECTED': await kvSet(db, 'membership', 'rejected'); break;
      case 'ENROLL_APPROVED': {
        const parentKey = await kvGet(db, 'parent_public_key');
        // The certificate must be signed by the Parent whose key was in the QR we scanned.
        if (!parentKey || parentKey !== m.parentPublicKey || !verifyObj(parentKey, m.certificate, m.certSig) || m.certificate.deviceId !== this.o.deviceId) return;
        await kvSet(db, 'role_id', m.certificate.roleId); await kvSet(db, 'membership', 'active'); break;
      }
      case 'WELCOME': {
        if (!(await this.acceptHeartbeat(m.heartbeat))) return;
        await kvSet(db, 'role_id', m.roleId); await kvSet(db, 'membership', 'active');
        this.authed = true;
        await this.send({ t: 'SYNC_REQUEST', afterSeq: Number((await kvGet(db, 'last_seq')) ?? '0') });
        await this.flush(true); break;
      }
      case 'HEARTBEAT': await this.acceptHeartbeat(m.heartbeat); return;
      case 'EVENT': await this.onParentEvent(m.event); break;
      case 'EVENTS': for (const e of m.events) await this.onParentEvent(e); break;
      case 'EVENT_RESULT': {
        const row = await getEventRow(db, m.eventId); if (!row || row.device_id !== this.o.deviceId) return;
        if (m.status === 'rejected' && row.state !== 'rejected' && row.state !== 'accepted') {
          await db.withTransactionAsync(async () => {
            const how = await revertEvent(db, rowToEvent(row));
            await db.runAsync(`UPDATE events SET state = 'rejected', reject_reason = ? WHERE event_id = ?`, [`${m.reason ?? 'rejected'} (${how})`, m.eventId]);
          });
        } else if (m.status === 'accepted' && row.state !== 'accepted') await db.runAsync(`UPDATE events SET state = 'acked' WHERE event_id = ?`, [m.eventId]);
        break;
      }
      case 'REVOKED': await kvSet(db, 'membership', 'revoked'); this.authed = false; break;
      default: return;
    }
    this.changed();
  }

  private async acceptHeartbeat(sh: SignedHeartbeat): Promise<boolean> {
    const key = await kvGet(this.o.db, 'parent_public_key');
    if (!key || !verifyObj(key, sh.hb, sh.sig) || sh.hb.networkId !== (await kvGet(this.o.db, 'network_id'))) return false;
    await kvSet(this.o.db, 'lease', JSON.stringify(leaseFrom(sh.hb, this.now())));
    return true;
  }

  /** Applies Parent-sequenced events strictly in order; a gap triggers a resync request instead of applying out of order. */
  private async onParentEvent(e: EventEnvelope): Promise<void> {
    const db = this.o.db;
    const key = await kvGet(db, 'parent_public_key');
    if (!key || !verifyParentSig(e, key) || e.seq === undefined) return;
    const last = Number((await kvGet(db, 'last_seq')) ?? '0');
    if (e.seq <= last) return;                                   // duplicate / already applied
    if (e.seq > last + 1) {                                      // gap: ask for the missing range once in a while
      if (this.now() - this.lastResyncAt > 1000) { this.lastResyncAt = this.now(); await this.send({ t: 'SYNC_REQUEST', afterSeq: last }); }
      return;
    }
    await db.withTransactionAsync(async () => {
      const own = await getEventRow(db, e.eventId);
      if (own) {
        // our optimistic copy is now confirmed; the Parent may have decided extra values (order number)
        await db.runAsync(`UPDATE events SET seq = ?, parent_sig = ?, meta = ?, state = 'accepted' WHERE event_id = ?`, [e.seq!, e.parentSig ?? '', JSON.stringify(e.meta ?? {}), e.eventId]);
        if (!own.applied) await applyEvent(db, e);
        else if (e.type === 'ORDER_CREATED' && e.meta?.orderNumber) await db.runAsync('UPDATE orders SET number = ? WHERE id = ?', [e.meta.orderNumber, e.entityId]);
      } else { await insertEvent(db, e, 'accepted', true); await applyEvent(db, e); }
      await kvSet(db, 'last_seq', String(e.seq));
      if (e.entityType === 'device' && e.entityId === this.o.deviceId) {
        if (e.type === 'DEVICE_ROLE_UPDATED') await kvSet(db, 'role_id', e.payload.roleId);
        if (e.type === 'DEVICE_REVOKED') await kvSet(db, 'membership', 'revoked');
      }
    });
    await this.send({ t: 'APPLIED', seq: e.seq });
  }
}
