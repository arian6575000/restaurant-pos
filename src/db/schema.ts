// SQLite schema + migrations (tracked with PRAGMA user_version).
// Anything that talks to SQLite goes through the small `Db` interface so the
// same code can run on expo-sqlite (app) and node:sqlite (tests).

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const MIGRATIONS: string[] = [
  // v1: event log + projections. Ids are UUIDs, money is integer minor units (ProcessHub convention).
  `
  CREATE TABLE kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);

  -- Append-only event log. On the Parent every row has a seq; on a Child own events are pending (seq NULL) until the Parent accepts.
  CREATE TABLE events (
    event_id TEXT PRIMARY KEY NOT NULL,
    network_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    base_version INTEGER NOT NULL DEFAULT 0,
    seq INTEGER,
    signature TEXT NOT NULL DEFAULT '',
    parent_sig TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,              -- pending | sent | acked | accepted | rejected
    reject_reason TEXT NOT NULL DEFAULT '',
    applied INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_try_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_events_seq ON events(seq) WHERE seq IS NOT NULL;
  CREATE INDEX idx_events_state ON events(state);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    event_id TEXT,
    type TEXT NOT NULL,
    outcome TEXT NOT NULL,            -- accepted | rejected
    detail TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE devices (
    device_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    role_id TEXT,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL,             -- pending | approved | revoked
    joined_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE roles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL,        -- JSON array of permission keys (custom roles only)
    version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL, category_id TEXT, name TEXT NOT NULL, price INTEGER NOT NULL,
    available INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE dining_tables (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 4,
    reserved INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE orders (
    id TEXT PRIMARY KEY NOT NULL,
    number INTEGER,                   -- human number, assigned by the Parent on acceptance
    order_type TEXT NOT NULL,
    table_id TEXT,
    status TEXT NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    tax_bps INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    rejected INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_table ON orders(table_id);
  CREATE TABLE order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    voided INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_items_order ON order_items(order_id);
  CREATE TABLE payments (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL,
    voided INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_payments_order ON payments(order_id);
  `,
];

export async function migrate(d: Db): Promise<void> {
  const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    await d.withTransactionAsync(async () => {
      await d.execAsync(MIGRATIONS[v]);
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
    v++;
  }
}
export const SCHEMA_VERSION = MIGRATIONS.length;
