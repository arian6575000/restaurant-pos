// Database access for the restaurant domain: key/value meta, event rows, projection queries. No UI, no transport.
import type { Db } from '../../db/schema';
import type { EventEnvelope, EventState } from '../events';
import { BUILTIN_ROLES, permissionsOfRole, type Permission } from '../permissions';
import { calcTotals, paymentState, type ItemStatus, type OrderStatus, type Totals, type PaymentState } from './order';

export async function kvGet(db: Db, k: string): Promise<string | null> {
  return (await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', [k]))?.v ?? null;
}
export async function kvSet(db: Db, k: string, v: string): Promise<void> {
  await db.runAsync('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', [k, v]);
}
export async function kvJson<T>(db: Db, k: string): Promise<T | null> {
  const s = await kvGet(db, k); if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

// ---------- event rows ----------
export interface EventRow {
  event_id: string; network_id: string; device_id: string; type: string; entity_type: string; entity_id: string; payload: string; meta: string;
  created_at: number; event_version: number; base_version: number; seq: number | null; signature: string; parent_sig: string;
  state: EventState; reject_reason: string; applied: number; attempts: number; next_try_at: number;
}
export function rowToEvent(r: EventRow): EventEnvelope {
  return {
    eventId: r.event_id, networkId: r.network_id, deviceId: r.device_id, type: r.type as any, entityType: r.entity_type as any,
    entityId: r.entity_id, payload: JSON.parse(r.payload), createdAt: r.created_at, eventVersion: r.event_version,
    baseVersion: r.base_version, seq: r.seq ?? undefined, meta: JSON.parse(r.meta || '{}'), signature: r.signature, parentSig: r.parent_sig || undefined,
  };
}
export async function getEventRow(db: Db, eventId: string): Promise<EventRow | null> {
  return db.getFirstAsync<EventRow>('SELECT * FROM events WHERE event_id = ?', [eventId]);
}
export async function insertEvent(db: Db, e: EventEnvelope, state: EventState, applied: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO events (event_id, network_id, device_id, type, entity_type, entity_id, payload, meta, created_at, event_version, base_version, seq, signature, parent_sig, state, applied)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [e.eventId, e.networkId, e.deviceId, e.type, e.entityType, e.entityId, JSON.stringify(e.payload), JSON.stringify(e.meta ?? {}), e.createdAt,
      e.eventVersion, e.baseVersion, e.seq ?? null, e.signature, e.parentSig ?? '', state, applied ? 1 : 0]);
}
export async function maxSeq(db: Db): Promise<number> {
  return (await db.getFirstAsync<{ m: number | null }>('SELECT MAX(seq) AS m FROM events'))?.m ?? 0;
}
export async function audit(db: Db, at: number, deviceId: string, eventId: string | null, type: string, outcome: 'accepted' | 'rejected', detail = ''): Promise<void> {
  await db.runAsync('INSERT INTO audit_log (at, device_id, event_id, type, outcome, detail) VALUES (?,?,?,?,?,?)', [at, deviceId, eventId, type, outcome, detail]);
}

// ---------- roles / devices ----------
export async function customRoles(db: Db): Promise<Record<string, string[]>> {
  const rows = await db.getAllAsync<{ id: string; permissions: string }>('SELECT id, permissions FROM roles');
  const out: Record<string, string[]> = {};
  for (const r of rows) { try { out[r.id] = JSON.parse(r.permissions); } catch { out[r.id] = []; } }
  return out;
}
export async function permissionsOfDevice(db: Db, deviceId: string): Promise<ReadonlySet<Permission>> {
  const d = await db.getFirstAsync<{ role_id: string | null; status: string }>('SELECT role_id, status FROM devices WHERE device_id = ?', [deviceId]);
  if (!d || d.status !== 'approved') return new Set();
  return permissionsOfRole(d.role_id, await customRoles(db));
}
export async function roleName(db: Db, roleId: string | null): Promise<string> {
  if (!roleId) return '';
  if (BUILTIN_ROLES[roleId]) return BUILTIN_ROLES[roleId].name;
  return (await db.getFirstAsync<{ name: string }>('SELECT name FROM roles WHERE id = ?', [roleId]))?.name ?? roleId;
}

// ---------- orders ----------
export interface OrderRow {
  id: string; number: number | null; order_type: string; table_id: string | null; status: OrderStatus; discount: number; tax_bps: number;
  note: string; created_by: string; created_at: number; version: number; rejected: number;
}
export interface ItemRow { id: string; order_id: string; product_id: string; name: string; qty: number; unit_price: number; note: string; status: ItemStatus; voided: number }
export interface PaymentRow { id: string; order_id: string; amount: number; method: string; voided: number; created_by: string; created_at: number }

export const getOrder = (db: Db, id: string) => db.getFirstAsync<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
export const getItems = (db: Db, orderId: string) => db.getAllAsync<ItemRow>('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid', [orderId]);
export const getPayments = (db: Db, orderId: string) => db.getAllAsync<PaymentRow>('SELECT * FROM payments WHERE order_id = ? ORDER BY rowid', [orderId]);

/** Totals of the non-voided items of an order. */
export const totalsOfItems = (items: ItemRow[], discount: number, taxBps: number): Totals =>
  calcTotals(items.filter((i) => !i.voided).map((i) => ({ qty: i.qty, unitPrice: i.unit_price })), discount, taxBps);

export interface OrderSummary { order: OrderRow; items: ItemRow[]; totals: Totals; paid: number; balance: number; payment: PaymentState }
export async function orderSummary(db: Db, id: string): Promise<OrderSummary | null> {
  const order = await getOrder(db, id); if (!order) return null;
  const items = await getItems(db, id);
  const totals = totalsOfItems(items, order.discount, order.tax_bps);
  const paid = (await getPayments(db, id)).filter((p) => !p.voided).reduce((s, p) => s + p.amount, 0);
  return { order, items, totals, paid, balance: totals.total - paid, payment: paymentState(totals.total, paid) };
}
export function listOrders(db: Db, statuses?: OrderStatus[]): Promise<OrderRow[]> {
  if (!statuses?.length) return db.getAllAsync<OrderRow>('SELECT * FROM orders WHERE rejected = 0 ORDER BY created_at DESC');
  return db.getAllAsync<OrderRow>(`SELECT * FROM orders WHERE rejected = 0 AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at DESC`, statuses);
}

/** A table is occupied when it has an order that is not closed/cancelled/rejected. Derived, never stored. */
export interface TableView { id: string; name: string; capacity: number; reserved: boolean; occupied: boolean; orderId: string | null }
export async function listTables(db: Db): Promise<TableView[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; capacity: number; reserved: number; order_id: string | null }>(
    `SELECT t.id, t.name, t.capacity, t.reserved,
       (SELECT o.id FROM orders o WHERE o.table_id = t.id AND o.rejected = 0 AND o.status NOT IN ('closed','cancelled') LIMIT 1) AS order_id
     FROM dining_tables t WHERE t.deleted = 0 ORDER BY t.name`);
  return rows.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, reserved: !!r.reserved, occupied: !!r.order_id, orderId: r.order_id }));
}
