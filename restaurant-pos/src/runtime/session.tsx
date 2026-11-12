// Runtime glue: opens the DB, loads the device identity, creates the Parent or Child node on the Nearby transport,
// and exposes one small API to the screens. All rules (permissions, state machine, sequencing) live in src/core.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import NearbyModule from '../../modules/nearby-connections';
import { NearbyTransport } from '../transport/nearby';
import { ParentNode } from '../core/network/parent';
import { ChildNode, type ChildStatus } from '../core/network/child';
import { decodeQr } from '../core/network/protocol';
import { BUILTIN_ROLES, ROLE_ADMIN, permissionsOfRole, type Permission } from '../core/permissions';
import { AppError, setRandomBytes, uuid } from '../core/util';
import type { EntityType, EventType } from '../core/events';
import { customRoles, kvGet, kvSet } from '../core/restaurant/store';
import type { Db } from '../db/schema';
import { destroyDb, getDb } from './db';
import { loadIdentity, resetIdentity, type NodeIdentity } from './identity';
import { ensureNearbyPermissions } from './permissions';
import { useApp } from '../ctx/AppContext';

setRandomBytes((n) => Crypto.getRandomBytes(n));

export const SERVICE_ID = 'com.restaurantpos.network';
export type Mode = 'parent' | 'child' | null;
export interface RunResult { ok: boolean; reason?: string }

/** Parent license state, set by <ParentLicenseBridge/> inside the LicenseGate. Children never hold a license. */
export const licenseRef: { current: { validUntil: number | null; allowChildren: boolean } } = { current: { validUntil: 0, allowChildren: false } };

interface Session {
  ready: boolean; error: string; mode: Mode; deviceId: string; db: Db | null;
  parent: ParentNode | null; child: ChildNode | null; childStatus: ChildStatus | null;
  /** Bumps on every local or remote change: screens reload when it changes. */
  rev: number;
  /** Last network problem (permission, Bluetooth/Wi-Fi/Location off, Parent not found). '' when fine. */
  netError: string;
  /** Parent only: devices waiting for approval. */
  pendingCount: number;
  retryNetwork: () => Promise<void>;
  perms: ReadonlySet<Permission>; roleName: string; restaurantName: string;
  can: (p: Permission) => boolean;
  createRestaurant: (name: string) => Promise<void>;
  joinWithQr: (qrText: string, deviceName: string) => Promise<void>;
  run: (type: EventType, entityType: EntityType, entityId: string, payload: Record<string, any>) => Promise<RunResult>;
  erase: () => Promise<void>;
}
const Ctx = createContext<Session>(null as any);
export const useSession = () => useContext(Ctx);

const errMsg = (e: unknown) => (e instanceof AppError ? e.code : e instanceof Error ? e.message : String(e));

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useApp();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [rev, setRev] = useState(0);
  const [perms, setPerms] = useState<ReadonlySet<Permission>>(new Set());
  const [roleName, setRoleName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [childStatus, setChildStatus] = useState<ChildStatus | null>(null);
  const [netError, setNetError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const lastPending = useRef(0);
  const dbRef = useRef<Db | null>(null);
  const idRef = useRef<NodeIdentity | null>(null);
  const parentRef = useRef<ParentNode | null>(null);
  const childRef = useRef<ChildNode | null>(null);
  const transportRef = useRef<NearbyTransport | null>(null);
  const unsub = useRef<(() => void)[]>([]);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const teardown = useCallback(async () => {
    unsub.current.forEach((u) => u()); unsub.current = [];
    timers.current.forEach(clearInterval); timers.current = [];
    parentRef.current?.stop(); childRef.current?.stop(); parentRef.current = null; childRef.current = null;
    try { await transportRef.current?.stop(); } catch { /* ignore */ }
    transportRef.current = null;
  }, []);

  const startNodes = useCallback(async (m: Exclude<Mode, null>) => {
    const db = dbRef.current!, id = idRef.current!;
    const transport = new NearbyTransport(NearbyModule as any, undefined, ensureNearbyPermissions);
    transportRef.current = transport;
    if (m === 'parent') {
      const networkId = (await kvGet(db, 'network_id'))!;
      const node = new ParentNode({ db, transport, networkId, deviceId: id.deviceId, keys: id.keys, license: () => licenseRef.current });
      parentRef.current = node; node.start();
      unsub.current.push(node.onChange(bump));
      try { await transport.start('parent', { serviceId: SERVICE_ID, name: node.endpointName }); setNetError(''); } catch (e) { setNetError(errMsg(e)); }
    } else {
      const node = new ChildNode({ db, transport, deviceId: id.deviceId, keys: id.keys, deviceName: (await kvGet(db, 'device_name')) ?? 'Device' });
      childRef.current = node; node.start();
      unsub.current.push(node.onChange(bump));
      const tryConnect = async () => { try { const st = await node.status(); if (!st.connected && st.membership !== 'revoked' && st.membership !== 'rejected' && st.membership !== 'none') await node.reconnect(); await node.tick(); setNetError(node.lastError); } catch (e) { setNetError(errMsg(e)); } };
      void tryConnect();
      timers.current.push(setInterval(() => { void tryConnect(); }, 6_000));
    }
  }, [bump]);

  // ---- boot ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await getDb(); dbRef.current = db; idRef.current = await loadIdentity();
        const m = (await kvGet(db, 'mode')) as Mode;
        if (m === 'parent' || m === 'child') { setMode(m); await startNodes(m); }
        if (alive) setReady(true);
      } catch (e) { if (alive) { setError(errMsg(e)); setReady(true); } }
    })();
    return () => { alive = false; void teardown(); };
  }, [startNodes, teardown]);

  // ---- derived state (permissions, role, lease status), recomputed on every change ----
  useEffect(() => {
    const db = dbRef.current; if (!db || !mode) return;
    let alive = true;
    (async () => {
      const name = (await db.getFirstAsync<{ restaurant: string }>(`SELECT json_extract(payload,'$.restaurantName') AS restaurant FROM events WHERE type='SETTINGS_UPDATED' AND state IN ('accepted') ORDER BY seq DESC LIMIT 1`))?.restaurant ?? '';
      if (mode === 'parent') {
        const pc = parentRef.current ? (await parentRef.current.pendingDevices()).length : 0;
        if (alive) { setPendingCount(pc); if (pc > lastPending.current) toast(pc === 1 ? 'A device wants to join. Open Devices to approve it.' : `${pc} devices want to join. Open Devices to approve them.`, 'success'); lastPending.current = pc; }
      }
      if (mode === 'parent') { if (alive) { setPerms(permissionsOfRole(ROLE_ADMIN, {})); setRoleName(BUILTIN_ROLES[ROLE_ADMIN].name); setRestaurantName(name); } return; }
      const child = childRef.current; if (!child) return;
      const roleId = await kvGet(db, 'role_id');
      const roles = await customRoles(db);
      const p = await child.permissions(); const st = await child.status();
      const rn = roleId ? (BUILTIN_ROLES[roleId]?.name ?? (await db.getFirstAsync<{ name: string }>('SELECT name FROM roles WHERE id = ?', [roleId]))?.name ?? roleId) : '';
      void roles;
      if (alive) { setPerms(p); setChildStatus(st); setRoleName(rn); setRestaurantName(name); }
    })().catch(() => {});
    return () => { alive = false; };
  }, [mode, rev]);
  // Lease status changes with time, not only with events: refresh periodically for Children.
  useEffect(() => { if (mode !== 'child') return; const id = setInterval(bump, 30_000); return () => clearInterval(id); }, [mode, bump]);
  useEffect(() => { const s = AppState.addEventListener('change', (st) => { if (st === 'active') bump(); }); return () => s.remove(); }, [bump]);

  const createRestaurant = useCallback(async (name: string) => {
    const db = dbRef.current!; if (!name.trim()) throw new AppError('name_required');
    await kvSet(db, 'mode', 'parent'); await kvSet(db, 'network_id', uuid());
    await teardown(); await startNodes('parent');
    await parentRef.current!.bootstrap(name.trim());
    setMode('parent'); bump();
  }, [bump, startNodes, teardown]);

  const joinWithQr = useCallback(async (qrText: string, deviceName: string) => {
    const db = dbRef.current!; const qr = decodeQr(qrText); if (!qr) throw new AppError('bad_qr');
    if (!deviceName.trim()) throw new AppError('name_required');
    await ensureNearbyPermissions();
    await teardown();
    await kvSet(db, 'device_name', deviceName.trim());
    await startNodes('child');
    await childRef.current!.join(qr);
    setMode('child'); bump();
  }, [bump, startNodes, teardown]);

  const run = useCallback(async (type: EventType, entityType: EntityType, entityId: string, payload: Record<string, any>): Promise<RunResult> => {
    try {
      if (parentRef.current) { const r = await parentRef.current.submit(type, entityType, entityId, payload); bump(); return r.status === 'accepted' ? { ok: true } : { ok: false, reason: r.reason }; }
      if (childRef.current) { await childRef.current.submit(type, entityType, entityId, payload); bump(); return { ok: true }; }
      return { ok: false, reason: 'not_ready' };
    } catch (e) { return { ok: false, reason: errMsg(e) }; }
  }, [bump]);

  const retryNetwork = useCallback(async () => {
    setNetError('');
    try {
      if (parentRef.current && transportRef.current) { await transportRef.current.stop(); await transportRef.current.start('parent', { serviceId: SERVICE_ID, name: parentRef.current.endpointName }); }
      else if (childRef.current) await childRef.current.reconnect();
    } catch (e) { setNetError(errMsg(e)); }
    bump();
  }, [bump]);

  const erase = useCallback(async () => {
    await teardown(); await destroyDb(); await resetIdentity();
    dbRef.current = await getDb(); idRef.current = await loadIdentity();
    setMode(null); setPerms(new Set()); setChildStatus(null); setRoleName(''); setRestaurantName(''); bump();
  }, [bump, teardown]);

  const value = useMemo<Session>(() => ({
    ready, error, mode, deviceId: idRef.current?.deviceId ?? '', db: dbRef.current, parent: parentRef.current, child: childRef.current, childStatus, rev, netError, pendingCount, retryNetwork,
    perms, roleName, restaurantName, can: (p) => perms.has(p), createRestaurant, joinWithQr, run, erase,
  }), [ready, error, mode, childStatus, rev, netError, pendingCount, retryNetwork, perms, roleName, restaurantName, createRestaurant, joinWithQr, run, erase]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Human-readable text for a rejection / error code. */
export function reasonText(code?: string): string {
  const m: Record<string, string> = {
    permission_denied: 'Your role does not allow this action.', stale_state: 'This order was changed by someone else. Refresh and try again.',
    illegal_transition: 'That status change is not allowed.', not_fully_paid: 'The bill must be fully paid before closing.',
    overpayment: 'The payment is more than the amount due.', table_occupied: 'That table already has an open order.',
    price_mismatch: 'A price changed. Reopen the menu and try again.', product_unavailable: 'That item is not available.',
    lease_grace_expired: 'Connect to the Parent device to continue (offline time limit reached).', license_expired: 'The Parent license has expired.',
    clock: 'Device date/time looks wrong. Please correct it.', not_enrolled: 'This device is not approved on the network.',
    has_payments: 'An order with payments cannot be cancelled.', empty_order: 'Add at least one item first.', order_locked: 'This order can no longer be edited.',
    permissions_denied: 'Nearby/Bluetooth permissions are required.', bad_qr: 'This is not a valid pairing QR code.', qr_expired: 'This pairing QR code has expired. Ask the Parent to show a new one.',
    name_required: 'Please enter a name.', children_not_allowed: 'The Parent license does not allow child devices.', endpoint_not_found: 'Parent device not found nearby.',
    start_failed: 'Could not start Bluetooth/Wi-Fi discovery. Turn on Bluetooth, Wi-Fi and Location, then retry.', request_failed: 'Could not reach the Parent device. Keep both devices close and retry.', connect_failed: 'The connection to the Parent was refused. Retry.',
  };
  return (code && m[code]) || (code ? `Not completed (${code}).` : 'Not completed.');
}
