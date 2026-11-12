// State-based validation and the permission each event requires. Runs on the Parent for every event (including the Parent's own).
import type { Db } from '../../db/schema';
import type { EventEnvelope } from '../events';
import { isPermission, type Permission } from '../permissions';
import { canItemTransition, canOrderTransition, ORDER_ACCEPTS_ITEMS, type ItemStatus, type OrderStatus } from './order';
import { getItems, getOrder, getPayments, totalsOfItems, type ItemRow } from './store';

export type Validation = { ok: true; permission: Permission } | { ok: false; reason: string };
const ok = (permission: Permission): Validation => ({ ok: true, permission });
const no = (reason: string): Validation => ({ ok: false, reason });

const ORDER_STATUS_PERMISSION: Partial<Record<OrderStatus, Permission>> = {
  sent_to_kitchen: 'orders.submit', in_preparation: 'kitchen.updateStatus', ready: 'orders.markReady',
  served: 'orders.markServed', closed: 'orders.close', cancelled: 'orders.cancel',
};
const ITEM_STATUS_PERMISSION: Partial<Record<ItemStatus, Permission>> = {
  preparing: 'kitchen.updateStatus', ready: 'kitchen.updateStatus', served: 'orders.markServed',
};
const PARENT_ONLY = ['DEVICE_JOINED', 'DEVICE_ROLE_UPDATED', 'DEVICE_REVOKED'];
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

export async function validateEvent(db: Db, e: EventEnvelope, parentDeviceId: string): Promise<Validation> {
  const p = e.payload ?? {};
  if (PARENT_ONLY.includes(e.type) && e.deviceId !== parentDeviceId) return no('parent_only');

  switch (e.type) {
    case 'ORDER_CREATED': {
      if (!['dine_in', 'takeaway', 'delivery'].includes(p.orderType)) return no('bad_order_type');
      if (await getOrder(db, e.entityId)) return no('duplicate_entity');
      if (p.orderType === 'dine_in') {
        if (!p.tableId) return no('table_required');
        const t = await db.getFirstAsync<{ id: string }>('SELECT id FROM dining_tables WHERE id = ? AND deleted = 0', [p.tableId]);
        if (!t) return no('unknown_table');
        const busy = await db.getFirstAsync<{ id: string }>(
          `SELECT id FROM orders WHERE table_id = ? AND rejected = 0 AND status NOT IN ('closed','cancelled') LIMIT 1`, [p.tableId]);
        if (busy) return no('table_occupied');
      }
      if (!isInt(p.taxBps ?? 0) || !isInt(p.discount ?? 0) || (p.discount ?? 0) < 0) return no('bad_amount');
      for (const it of (p.items ?? []) as any[]) { const r = await checkItem(db, it); if (r) return no(r); }
      return ok('orders.create');
    }
    case 'ORDER_UPDATED': {
      const o = await getOrder(db, e.entityId); if (!o) return no('unknown_order');
      if (!ORDER_ACCEPTS_ITEMS.includes(o.status)) return no('order_locked');
      if (('discount' in p || 'taxBps' in p) && (!isInt(p.discount ?? 0) || !isInt(p.taxBps ?? 0) || (p.discount ?? 0) < 0)) return no('bad_amount');
      return ok('discount' in p || 'taxBps' in p ? 'orders.discount' : 'orders.update');
    }
    case 'ORDER_STATUS_CHANGED': {
      const o = await getOrder(db, e.entityId); if (!o) return no('unknown_order');
      if (o.status !== p.from) return no('stale_state');
      if (!canOrderTransition(o.status, p.to)) return no('illegal_transition');
      const items = await getItems(db, o.id);
      if (p.to === 'sent_to_kitchen' && items.filter((i) => !i.voided).length === 0) return no('empty_order');
      const paid = (await getPayments(db, o.id)).filter((x) => !x.voided).reduce((s, x) => s + x.amount, 0);
      if (p.to === 'closed' && paid < totalsOfItems(items, o.discount, o.tax_bps).total) return no('not_fully_paid');
      if (p.to === 'cancelled' && paid > 0) return no('has_payments');
      const perm = ORDER_STATUS_PERMISSION[p.to as OrderStatus];
      return perm ? ok(perm) : no('illegal_transition');
    }
    case 'ORDER_ITEM_ADDED': {
      const orderId = p.orderId ?? e.entityId;
      const o = await getOrder(db, orderId); if (!o) return no('unknown_order');
      if (!ORDER_ACCEPTS_ITEMS.includes(o.status)) return no('order_locked');
      if (await db.getFirstAsync('SELECT id FROM order_items WHERE id = ?', [p.itemId])) return no('duplicate_entity');
      const r = await checkItem(db, { ...p, id: p.itemId }); if (r) return no(r);
      return ok('orders.update');
    }
    case 'ORDER_ITEM_REMOVED': {
      const it = await itemOf(db, p.itemId); if (!it) return no('unknown_item');
      if (it.voided) return no('stale_state');
      const o = await getOrder(db, it.order_id);
      if (!o || !ORDER_ACCEPTS_ITEMS.includes(o.status)) return no('order_locked');
      if (!canItemTransition(it.status, 'voided')) return no('illegal_transition');
      return ok(it.status === 'new' ? 'orders.update' : 'items.void');
    }
    case 'ORDER_ITEM_STATUS_CHANGED': {
      const it = await itemOf(db, p.itemId); if (!it) return no('unknown_item');
      if (it.status !== p.from) return no('stale_state');
      if (!canItemTransition(it.status, p.to)) return no('illegal_transition');
      const perm = ITEM_STATUS_PERMISSION[p.to as ItemStatus];
      return perm ? ok(perm) : no('illegal_transition');
    }
    case 'PAYMENT_RECORDED': {
      const o = await getOrder(db, p.orderId); if (!o) return no('unknown_order');
      if (o.status === 'cancelled' || o.rejected) return no('order_cancelled');
      if (!isInt(p.amount) || p.amount <= 0) return no('bad_amount');
      if (!['cash', 'card', 'online', 'other'].includes(p.method)) return no('bad_method');
      if (await db.getFirstAsync('SELECT id FROM payments WHERE id = ?', [e.entityId])) return no('duplicate_entity');
      const total = totalsOfItems(await getItems(db, o.id), o.discount, o.tax_bps).total;
      const paid = (await getPayments(db, o.id)).filter((x) => !x.voided).reduce((s, x) => s + x.amount, 0);
      if (paid + p.amount > total) return no('overpayment');
      return ok('payments.record');
    }
    case 'PAYMENT_VOIDED': {
      const pay = await db.getFirstAsync<{ voided: number; order_id: string }>('SELECT voided, order_id FROM payments WHERE id = ?', [e.entityId]);
      if (!pay) return no('unknown_payment');
      if (pay.voided) return no('stale_state');
      const o = await getOrder(db, pay.order_id);
      if (o?.status === 'closed') return no('order_closed');
      return ok('payments.void');
    }
    case 'TABLE_UPSERTED': return p.name ? ok('tables.manage') : no('name_required');
    case 'TABLE_STATUS_CHANGED': return (await db.getFirstAsync('SELECT id FROM dining_tables WHERE id = ?', [e.entityId])) ? ok('tables.manage') : no('unknown_table');
    case 'CATEGORY_UPSERTED': return p.name ? ok('menu.manage') : no('name_required');
    case 'PRODUCT_UPSERTED': return p.name && isInt(p.price) && p.price >= 0 ? ok('menu.manage') : no('bad_amount');
    case 'ROLE_UPSERTED': {
      if (!p.name || !Array.isArray(p.permissions) || !p.permissions.every((x: unknown) => typeof x === 'string' && isPermission(x))) return no('bad_role');
      if (e.entityId.startsWith('role-')) return no('builtin_role');
      return ok('roles.manage');
    }
    case 'SETTINGS_UPDATED': return ok('settings.manage');
    case 'DEVICE_JOINED': case 'DEVICE_ROLE_UPDATED': case 'DEVICE_REVOKED': return ok('devices.manage');
    default: return no('unknown_event_type');
  }
}

async function itemOf(db: Db, id: string): Promise<ItemRow | null> {
  return db.getFirstAsync<ItemRow>('SELECT * FROM order_items WHERE id = ?', [id]);
}

/** Product must exist, be available, quantity sane, and the price must match the Parent's menu (devices cannot set their own prices). */
async function checkItem(db: Db, it: any): Promise<string | null> {
  if (!it?.id || !isInt(it.qty) || it.qty <= 0 || it.qty > 999) return 'bad_quantity';
  const pr = await db.getFirstAsync<{ price: number; available: number; deleted: number; name: string }>('SELECT price, available, deleted, name FROM products WHERE id = ?', [it.productId]);
  if (!pr || pr.deleted) return 'unknown_product';
  if (!pr.available) return 'product_unavailable';
  if (it.unitPrice !== pr.price) return 'price_mismatch';
  return null;
}
