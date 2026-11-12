// Projection: turns events into table rows. Deterministic, so every device that applies the same events in seq order ends in the same state.
import type { Db } from '../../db/schema';
import type { EventEnvelope } from '../events';
import { kvSet, getOrder, getItems } from './store';

export async function applyEvent(db: Db, e: EventEnvelope): Promise<void> {
  const p = e.payload;
  switch (e.type) {
    case 'ORDER_CREATED': {
      await db.runAsync(
        `INSERT INTO orders (id, number, order_type, table_id, status, discount, tax_bps, note, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [e.entityId, e.meta?.orderNumber ?? null, p.orderType, p.tableId ?? null, 'open', p.discount ?? 0, p.taxBps ?? 0, p.note ?? '', e.deviceId, e.createdAt]);
      for (const it of (p.items ?? []) as any[]) await insertItem(db, e.entityId, it, 'new');
      break;
    }
    case 'ORDER_UPDATED': {
      const o = await getOrder(db, e.entityId); if (!o) break;
      await db.runAsync('UPDATE orders SET note = ?, discount = ?, tax_bps = ?, table_id = ?, version = version + 1 WHERE id = ?',
        [p.note ?? o.note, p.discount ?? o.discount, p.taxBps ?? o.tax_bps, 'tableId' in p ? p.tableId : o.table_id, e.entityId]);
      break;
    }
    case 'ORDER_STATUS_CHANGED': {
      await db.runAsync('UPDATE orders SET status = ?, version = version + 1 WHERE id = ?', [p.to, e.entityId]);
      if (p.to === 'sent_to_kitchen') await db.runAsync(`UPDATE order_items SET status = 'sent' WHERE order_id = ? AND status = 'new'`, [e.entityId]);
      if (p.to === 'in_preparation') await db.runAsync(`UPDATE order_items SET status = 'preparing' WHERE order_id = ? AND status = 'sent'`, [e.entityId]);
      if (p.to === 'ready') await db.runAsync(`UPDATE order_items SET status = 'ready' WHERE order_id = ? AND status IN ('sent','preparing')`, [e.entityId]);
      if (p.to === 'served') await db.runAsync(`UPDATE order_items SET status = 'served' WHERE order_id = ? AND voided = 0 AND status = 'ready'`, [e.entityId]);
      break;
    }
    case 'ORDER_ITEM_ADDED': {
      const o = await getOrder(db, p.orderId ?? e.entityId);
      await insertItem(db, p.orderId ?? e.entityId, { ...p, id: p.itemId }, o && o.status !== 'open' ? 'sent' : 'new');
      break;
    }
    case 'ORDER_ITEM_REMOVED':
      await db.runAsync(`UPDATE order_items SET voided = 1, status = 'voided' WHERE id = ?`, [p.itemId]); break;
    case 'ORDER_ITEM_STATUS_CHANGED':
      await db.runAsync('UPDATE order_items SET status = ? WHERE id = ?', [p.to, p.itemId]); break;
    case 'PAYMENT_RECORDED':
      await db.runAsync('INSERT INTO payments (id, order_id, amount, method, created_by, created_at) VALUES (?,?,?,?,?,?)',
        [e.entityId, p.orderId, p.amount, p.method, e.deviceId, e.createdAt]); break;
    case 'PAYMENT_VOIDED':
      await db.runAsync('UPDATE payments SET voided = 1 WHERE id = ?', [e.entityId]); break;
    case 'TABLE_UPSERTED':
      await db.runAsync(
        `INSERT INTO dining_tables (id, name, capacity, reserved, deleted) VALUES (?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, capacity = excluded.capacity, deleted = excluded.deleted, version = version + 1`,
        [e.entityId, p.name, p.capacity ?? 4, p.reserved ? 1 : 0, p.deleted ? 1 : 0]); break;
    case 'TABLE_STATUS_CHANGED':
      await db.runAsync('UPDATE dining_tables SET reserved = ?, version = version + 1 WHERE id = ?', [p.reserved ? 1 : 0, e.entityId]); break;
    case 'CATEGORY_UPSERTED':
      await db.runAsync(
        `INSERT INTO categories (id, name, sort, deleted) VALUES (?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort, deleted = excluded.deleted, version = version + 1`,
        [e.entityId, p.name, p.sort ?? 0, p.deleted ? 1 : 0]); break;
    case 'PRODUCT_UPSERTED':
      await db.runAsync(
        `INSERT INTO products (id, category_id, name, price, available, deleted) VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, price = excluded.price,
           available = excluded.available, deleted = excluded.deleted, version = version + 1`,
        [e.entityId, p.categoryId ?? null, p.name, p.price, p.available === false ? 0 : 1, p.deleted ? 1 : 0]); break;
    case 'ROLE_UPSERTED':
      await db.runAsync(
        `INSERT INTO roles (id, name, permissions) VALUES (?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, permissions = excluded.permissions, version = version + 1`,
        [e.entityId, p.name, JSON.stringify(p.permissions ?? [])]); break;
    case 'SETTINGS_UPDATED':
      await kvSet(db, 'settings', JSON.stringify(p)); break;
    case 'DEVICE_JOINED':
      await db.runAsync(
        `INSERT INTO devices (device_id, name, role_id, public_key, status, joined_at) VALUES (?,?,?,?,'approved',?)
         ON CONFLICT(device_id) DO UPDATE SET name = excluded.name, role_id = excluded.role_id, public_key = excluded.public_key, status = 'approved', version = version + 1`,
        [e.entityId, p.name, p.roleId, p.publicKey, e.createdAt]); break;
    case 'DEVICE_ROLE_UPDATED':
      await db.runAsync('UPDATE devices SET role_id = ?, name = COALESCE(?, name), version = version + 1 WHERE device_id = ?', [p.roleId, p.name ?? null, e.entityId]); break;
    case 'DEVICE_REVOKED':
      await db.runAsync(`UPDATE devices SET status = 'revoked', version = version + 1 WHERE device_id = ?`, [e.entityId]); break;
  }
}

async function insertItem(db: Db, orderId: string, it: any, status: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price, note, status) VALUES (?,?,?,?,?,?,?,?)',
    [it.id, orderId, it.productId, it.name, it.qty, it.unitPrice, it.note ?? '', status]);
}

/** Child side: a Parent rejection undoes the optimistic local change as far as it can be undone. Returns a short description. */
export async function revertEvent(db: Db, e: EventEnvelope): Promise<string> {
  const p = e.payload;
  switch (e.type) {
    case 'ORDER_CREATED':
      await db.runAsync(`UPDATE orders SET rejected = 1, status = 'cancelled' WHERE id = ?`, [e.entityId]); return 'order discarded';
    case 'ORDER_ITEM_ADDED':
      await db.runAsync(`UPDATE order_items SET voided = 1, status = 'voided' WHERE id = ?`, [p.itemId]); return 'item discarded';
    case 'ORDER_STATUS_CHANGED': {
      const o = await getOrder(db, e.entityId);
      if (o && o.status === p.to) {
        await db.runAsync('UPDATE orders SET status = ? WHERE id = ?', [p.from, e.entityId]);
        if (p.to === 'sent_to_kitchen') await db.runAsync(`UPDATE order_items SET status = 'new' WHERE order_id = ? AND status = 'sent'`, [e.entityId]);
      }
      return 'status restored';
    }
    case 'ORDER_ITEM_STATUS_CHANGED':
      await db.runAsync('UPDATE order_items SET status = ? WHERE id = ? AND status = ?', [p.from, p.itemId, p.to]); return 'item status restored';
    case 'PAYMENT_RECORDED':
      await db.runAsync('UPDATE payments SET voided = 1 WHERE id = ?', [e.entityId]); return 'payment discarded';
    case 'ORDER_ITEM_REMOVED':
      await db.runAsync('UPDATE order_items SET voided = 0, status = ? WHERE id = ?', [p.fromStatus ?? 'new', p.itemId]); return 'item restored';
    default:
      return 'no local undo for this event type';
  }
}

export async function itemsOf(db: Db, orderId: string) { return getItems(db, orderId); }
