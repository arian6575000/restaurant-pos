// Parent/Child network tests over the in-memory transport. Run: tsx tests/network.test.ts
import assert from 'node:assert/strict';
import { migrate, type Db } from '../src/db/schema';
import { createNodeDb } from './nodeDb';
import { MemoryNetwork } from '../src/transport/memory';
import { ParentNode } from '../src/core/network/parent';
import { ChildNode } from '../src/core/network/child';
import { buildEvent } from '../src/core/events';
import { encodeMsg } from '../src/core/network/protocol';
import { newIdentity, uuid, type Identity } from '../src/core/util';
import { ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN, ROLE_WAITER } from '../src/core/permissions';
import { LEASE_GRACE_MS } from '../src/core/network/lease';
import { getEventRow, kvGet, listTables, orderSummary, listOrders } from '../src/core/restaurant/store';

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 1)); };
let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n', e); process.exitCode = 1; } };
const rejects = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e: any) { assert.equal(e.code ?? e.message, code); return; } assert.fail(`expected ${code}`); };

const T0 = 1_700_000_000_000;
interface World {
  net: MemoryNetwork; db: Db; parent: ParentNode; networkId: string; parentId: string; keys: Identity;
  clock: { t: number }; lic: { validUntil: number | null; allowChildren: boolean };
  ids: { table: string; cat: string; burger: string; tea: string };
}
async function world(): Promise<World> {
  const net = new MemoryNetwork(), db = createNodeDb(); await migrate(db);
  const clock = { t: T0 }, lic = { validUntil: null as number | null, allowChildren: true };
  const keys = newIdentity(), parentId = uuid(), networkId = uuid();
  const pt = net.create(); await pt.start('parent', { serviceId: 'rpos', name: 'Parent-A' });
  const parent = new ParentNode({ db, transport: pt, networkId, deviceId: parentId, keys, now: () => clock.t, license: () => lic });
  parent.start(); await parent.bootstrap('Test Cafe');
  const ids = { table: uuid(), cat: uuid(), burger: uuid(), tea: uuid() };
  const ok = async (r: Promise<any>) => assert.equal((await r).status, 'accepted');
  await ok(parent.submit('CATEGORY_UPSERTED', 'category', ids.cat, { name: 'Food' }));
  await ok(parent.submit('PRODUCT_UPSERTED', 'product', ids.burger, { categoryId: ids.cat, name: 'Burger', price: 45000 }));
  await ok(parent.submit('PRODUCT_UPSERTED', 'product', ids.tea, { categoryId: ids.cat, name: 'Tea', price: 8000 }));
  await ok(parent.submit('TABLE_UPSERTED', 'table', ids.table, { name: 'T1', capacity: 4 }));
  return { net, db, parent, networkId, parentId, keys, clock, lic, ids };
}
interface Kid { node: ChildNode; db: Db; id: string; keys: Identity; transport: ReturnType<MemoryNetwork['create']> }
async function addChild(w: World, name: string, roleId: string): Promise<Kid> {
  const db = createNodeDb(); await migrate(db);
  const keys = newIdentity(), id = uuid(), transport = w.net.create();
  const node = new ChildNode({ db, transport, deviceId: id, keys, deviceName: name, now: () => w.clock.t });
  node.start();
  await node.join(w.parent.openPairing('rpos', 'Parent-A'));
  await settle();
  assert.equal((await node.status()).membership, 'waiting', 'child waits for Parent approval');
  await w.parent.approve(id, name, roleId); await settle();
  return { node, db, id, keys, transport };
}
const item = (w: World, productId: string, qty = 1) => ({ id: uuid(), productId, name: productId === w.ids.burger ? 'Burger' : 'Tea', qty, unitPrice: productId === w.ids.burger ? 45000 : 8000, note: '' });
async function newOrder(w: World, kid: Kid, items = [item(w, w.ids.burger, 2)]) {
  const id = uuid();
  await kid.node.submit('ORDER_CREATED', 'order', id, { orderType: 'dine_in', tableId: w.ids.table, note: '', taxBps: 1600, discount: 0, items });
  await settle(); return id;
}
const status = (db: Db, id: string) => orderSummary(db, id).then((s) => s?.order.status);

async function main() {
  console.log('network tests');

  await test('pairing: pending until Parent approves, then active with role and full replica', async () => {
    const w = await world(); const k = await addChild(w, 'Waiter 1', ROLE_WAITER);
    const st = await k.node.status();
    assert.equal(st.membership, 'active'); assert.ok(st.authed); assert.equal(st.lease, 'ok');
    assert.equal((await listTables(k.db)).length, 1, 'child replayed the Parent log');
    assert.equal(await kvGet(k.db, 'role_id'), ROLE_WAITER);
    assert.deepEqual(w.parent.connectedDeviceIds(), [k.id]);
  });

  await test('pairing: bad QR proof and expired QR are rejected', async () => {
    const w = await world();
    const mk = async () => { const db = createNodeDb(); await migrate(db); const n = new ChildNode({ db, transport: w.net.create(), deviceId: uuid(), keys: newIdentity(), deviceName: 'X', now: () => w.clock.t }); n.start(); return { n, db }; };
    const a = await mk(); const qr = w.parent.openPairing('rpos', 'Parent-A');
    await a.n.join({ ...qr, nonce: 'forged' }); await settle();
    assert.equal((await a.n.status()).membership, 'rejected');
    assert.equal((await w.parent.pendingDevices()).length, 0);
    const b = await mk(); const old = w.parent.openPairing('rpos', 'Parent-A', 1000);
    w.clock.t += 5000; await rejects(b.n.join(old), 'qr_expired');
    const c = await mk(); const qr2 = w.parent.openPairing('rpos', 'Parent-A', 1000);
    const cj = c.n.join(qr2); w.clock.t += 0; await cj; await settle(); w.parent.closePairing();
    assert.equal((await w.parent.pendingDevices()).length, 1, 'valid QR enrols as pending only');
  });

  await test('waiter order flows through Parent: sequenced, numbered, broadcast to kitchen', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER); const kitchen = await addChild(w, 'K', ROLE_KITCHEN);
    const id = await newOrder(w, waiter);
    const row = await getEventRow(waiter.db, (await w.db.getFirstAsync<{ event_id: string }>(`SELECT event_id FROM events WHERE type = 'ORDER_CREATED'`))!.event_id);
    assert.equal(row?.state, 'accepted'); assert.ok(row!.seq! > 0);
    assert.equal((await orderSummary(waiter.db, id))!.order.number, 1, 'Parent-assigned number reached the origin');
    assert.equal((await orderSummary(kitchen.db, id))!.order.number, 1);
    assert.equal((await orderSummary(w.db, id))!.totals.total, 104400, '2 x 450.00 + 16% tax');
    await waiter.node.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'open', to: 'sent_to_kitchen' }); await settle();
    await kitchen.node.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'sent_to_kitchen', to: 'in_preparation' }); await settle();
    await kitchen.node.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'in_preparation', to: 'ready' }); await settle();
    await waiter.node.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'ready', to: 'served' }); await settle();
    for (const d of [w.db, waiter.db, kitchen.db]) assert.equal(await status(d, id), 'served');
    assert.equal((await listTables(w.db))[0].occupied, true, 'table occupancy is derived from the open order');
  });

  await test('permissions are enforced on the Parent, not only on the Child', async () => {
    const w = await world(); const kitchen = await addChild(w, 'K', ROLE_KITCHEN); const waiter = await addChild(w, 'W', ROLE_WAITER);
    const id = await newOrder(w, waiter);
    await rejects(kitchen.node.submit('ORDER_CREATED', 'order', uuid(), { orderType: 'takeaway', note: '', items: [] }), 'permission_denied');   // local fast-fail
    // a modified Child that skips its local check and sends a forged request straight to the Parent:
    const forged = buildEvent({ networkId: w.networkId, deviceId: kitchen.id, secretKey: kitchen.keys.secretKey, type: 'PAYMENT_RECORDED', entityType: 'payment', entityId: uuid(), payload: { orderId: id, amount: 1000, method: 'cash' }, now: w.clock.t });
    await (kitchen.node as any).send({ t: 'EVENT', event: forged }); await settle();
    const r = await getEventRow(w.db, forged.eventId);
    assert.equal(r?.state, 'rejected'); assert.equal(r?.reject_reason, 'permission_denied');
    assert.equal((await orderSummary(w.db, id))!.paid, 0);
    const audit = await w.db.getFirstAsync<{ outcome: string; detail: string }>(`SELECT outcome, detail FROM audit_log WHERE event_id = ?`, [forged.eventId]);
    assert.equal(audit?.outcome, 'rejected', 'rejections are audited'); assert.equal(audit?.detail, 'permission_denied');
    // signature from the wrong key
    const spoof = buildEvent({ networkId: w.networkId, deviceId: waiter.id, secretKey: kitchen.keys.secretKey, type: 'ORDER_UPDATED', entityType: 'order', entityId: id, payload: { note: 'hi' }, now: w.clock.t });
    await (waiter.node as any).send({ t: 'EVENT', event: spoof }); await settle();
    assert.equal((await getEventRow(w.db, spoof.eventId))?.reject_reason, 'bad_signature');
    // a Child cannot impersonate another device id on its own session
    const imp = buildEvent({ networkId: w.networkId, deviceId: waiter.id, secretKey: waiter.keys.secretKey, type: 'ORDER_UPDATED', entityType: 'order', entityId: id, payload: { note: 'hi' }, now: w.clock.t });
    await (kitchen.node as any).send({ t: 'EVENT', event: imp }); await settle();
    assert.equal((await getEventRow(w.db, imp.eventId))?.reject_reason, 'device_mismatch');
  });

  await test('a Child with the admin role still cannot manage devices (parent-only)', async () => {
    const w = await world(); const k = await addChild(w, 'Mgr', ROLE_ADMIN);
    const ev = buildEvent({ networkId: w.networkId, deviceId: k.id, secretKey: k.keys.secretKey, type: 'DEVICE_REVOKED', entityType: 'device', entityId: w.parentId, payload: {}, now: w.clock.t });
    await (k.node as any).send({ t: 'EVENT', event: ev }); await settle();
    assert.equal((await getEventRow(w.db, ev.eventId))?.reject_reason, 'parent_only');
  });

  await test('state machine: illegal/stale transitions and unpaid close are rejected; cancel releases the table', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER); const cashier = await addChild(w, 'C', ROLE_CASHIER);
    const id = await newOrder(w, waiter);
    const skip = await w.parent.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'open', to: 'served' }); assert.equal(skip.reason, 'illegal_transition');
    const stale = await w.parent.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'ready', to: 'served' }); assert.equal(stale.reason, 'stale_state');
    const second = await w.parent.submit('ORDER_CREATED', 'order', uuid(), { orderType: 'dine_in', tableId: w.ids.table, note: '', items: [] }); assert.equal(second.reason, 'table_occupied');
    assert.equal((await w.parent.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'open', to: 'cancelled' })).status, 'accepted'); await settle();
    assert.equal((await listTables(w.db))[0].occupied, false, 'cancelled order frees the table (a DinePOS defect we do not copy)');
    assert.equal((await listTables(waiter.db))[0].occupied, false);
    // payments: cashier pays a served order
    const id2 = await newOrder(w, waiter, [item(w, w.ids.tea, 1)]);
    for (const [from, to] of [['open', 'sent_to_kitchen'], ['sent_to_kitchen', 'in_preparation'], ['in_preparation', 'ready'], ['ready', 'served']]) assert.equal((await w.parent.submit('ORDER_STATUS_CHANGED', 'order', id2, { from, to })).status, 'accepted');
    await settle();
    assert.equal((await w.parent.submit('ORDER_STATUS_CHANGED', 'order', id2, { from: 'served', to: 'closed' })).reason, 'not_fully_paid');
    await rejects(cashier.node.submit('PAYMENT_RECORDED', 'payment', uuid(), { orderId: id2, amount: 99999999, method: 'cash' }), 'overpayment');
    const total = (await orderSummary(w.db, id2))!.totals.total;
    await cashier.node.submit('PAYMENT_RECORDED', 'payment', uuid(), { orderId: id2, amount: total, method: 'cash' }); await settle();
    assert.equal((await orderSummary(w.db, id2))!.payment, 'paid');
    await cashier.node.submit('ORDER_STATUS_CHANGED', 'order', id2, { from: 'served', to: 'closed' }); await settle();
    assert.equal(await status(w.db, id2), 'closed');
    assert.equal((await w.parent.submit('PAYMENT_VOIDED', 'payment', (await w.db.getFirstAsync<{ id: string }>('SELECT id FROM payments'))!.id, {})).reason, 'order_closed');
  });

  await test('menu prices are authoritative: stale Child price is rejected by the Parent and rolled back on the Child', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER);
    await waiter.transport.disconnect((waiter.transport as any).peers()[0]); await settle();             // Child goes offline
    await w.parent.submit('PRODUCT_UPSERTED', 'product', w.ids.burger, { categoryId: w.ids.cat, name: 'Burger', price: 50000 });
    const id = uuid();
    await waiter.node.submit('ORDER_CREATED', 'order', id, { orderType: 'takeaway', note: '', taxBps: 0, discount: 0, items: [item(w, w.ids.burger)] });   // stale price 45000
    assert.equal((await orderSummary(waiter.db, id))!.order.status, 'open', 'optimistic local copy while offline');
    assert.equal((await waiter.node.status()).pendingEvents, 1);
    await waiter.node.reconnect(); await settle();
    const ev = await waiter.db.getFirstAsync<{ state: string; reject_reason: string }>(`SELECT state, reject_reason FROM events WHERE type = 'ORDER_CREATED'`);
    assert.equal(ev?.state, 'rejected'); assert.match(ev!.reject_reason, /price_mismatch/);
    assert.equal((await listOrders(waiter.db)).length, 0, 'rejected order disappears from the Child lists');
    assert.equal((await listOrders(w.db)).length, 0, 'and never reached the Parent state');
    assert.equal((await waiter.node.status()).pendingEvents, 0);
  });

  await test('offline queue: events created while disconnected are delivered in order on reconnect', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER);
    await waiter.transport.disconnect((waiter.transport as any).peers()[0]); await settle();
    const id = uuid();
    await waiter.node.submit('ORDER_CREATED', 'order', id, { orderType: 'dine_in', tableId: w.ids.table, note: '', taxBps: 0, discount: 0, items: [item(w, w.ids.tea)] });
    await waiter.node.submit('ORDER_ITEM_ADDED', 'order_item', id, { orderId: id, ...(() => { const i = item(w, w.ids.burger); return { itemId: i.id, productId: i.productId, name: i.name, qty: 1, unitPrice: i.unitPrice, note: '' }; })() });
    await waiter.node.submit('ORDER_STATUS_CHANGED', 'order', id, { from: 'open', to: 'sent_to_kitchen' });
    assert.equal((await waiter.node.status()).pendingEvents, 3); assert.equal((await listOrders(w.db)).length, 0, 'Parent knows nothing yet: local write is not delivery');
    await waiter.node.reconnect(); await settle();
    assert.equal((await waiter.node.status()).pendingEvents, 0);
    const s = await orderSummary(w.db, id); assert.equal(s?.order.status, 'sent_to_kitchen'); assert.equal(s?.items.length, 2);
  });

  await test('duplicate delivery has no second effect; retry resends until acknowledged', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER);
    const ev = buildEvent({ networkId: w.networkId, deviceId: waiter.id, secretKey: waiter.keys.secretKey, type: 'ORDER_CREATED', entityType: 'order', entityId: uuid(), payload: { orderType: 'takeaway', note: '', taxBps: 0, discount: 0, items: [] }, now: w.clock.t });
    for (let i = 0; i < 3; i++) await (waiter.node as any).send({ t: 'EVENT', event: ev });
    await settle();
    assert.equal((await listOrders(w.db)).length, 1); assert.equal((await w.db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM events WHERE event_id = ?`, [ev.eventId]))!.c, 1);
    // lost frames: nothing arrives, event stays queued, tick() retries after backoff
    w.net.dropFrames = true;
    const id = await newOrder(w, waiter, [item(w, w.ids.tea)]).catch(() => null);
    const pending = (await waiter.node.status()).pendingEvents; assert.ok(pending >= 1 || id === null);
    w.net.dropFrames = false; w.clock.t += 120_000; await waiter.node.tick(); await settle();
    assert.equal((await waiter.node.status()).pendingEvents, 0, 'retry after backoff delivered it');
    assert.equal((await listOrders(w.db)).length, 2, 'delivered exactly once even though it was sent more than once');
  });

  await test('gap detection: missed broadcasts are recovered by resync, applied strictly in order', async () => {
    const w = await world(); const k = await addChild(w, 'K', ROLE_KITCHEN);
    w.net.dropFrames = true;
    for (const n of ['A', 'B', 'C']) await w.parent.submit('CATEGORY_UPSERTED', 'category', uuid(), { name: n });
    w.net.dropFrames = false;
    await w.parent.submit('CATEGORY_UPSERTED', 'category', uuid(), { name: 'D' }); await settle(); await settle();
    const names = (await k.db.getAllAsync<{ name: string }>('SELECT name FROM categories ORDER BY rowid')).map((r) => r.name);
    assert.deepEqual(names, ['Food', 'A', 'B', 'C', 'D']);
    assert.equal((await k.node.status()).lastSeq, (await w.db.getFirstAsync<{ m: number }>('SELECT MAX(seq) AS m FROM events'))!.m);
  });

  await test('revocation: Child is cut off immediately, its queued and later events are refused', async () => {
    const w = await world(); const waiter = await addChild(w, 'W', ROLE_WAITER); const id = await newOrder(w, waiter);
    await w.parent.revoke(waiter.id); await settle();
    assert.equal((await waiter.node.status()).membership, 'revoked');
    await rejects(waiter.node.submit('ORDER_UPDATED', 'order', id, { note: 'x' }), 'not_enrolled');
    const ev = buildEvent({ networkId: w.networkId, deviceId: waiter.id, secretKey: waiter.keys.secretKey, type: 'ORDER_UPDATED', entityType: 'order', entityId: id, payload: { note: 'late' }, now: w.clock.t });
    const r = await (w.parent as any).process(ev, { peerId: 'x', deviceId: waiter.id, authed: true });
    assert.equal(r.reason, 'device_revoked');
    await waiter.node.reconnect().catch(() => {}); await settle();
    assert.equal(w.parent.connectedDeviceIds().length, 0);
    await rejects(w.parent.revoke(w.parentId), 'cannot_revoke_parent');
  });

  await test('role change takes effect on the Parent for the next command', async () => {
    const w = await world(); const k = await addChild(w, 'K', ROLE_KITCHEN);
    await w.parent.submit('ROLE_UPSERTED', 'role', 'custom-runner', { name: 'Runner', permissions: ['orders.view', 'orders.markServed'] });
    await w.parent.setRole(k.id, 'custom-runner'); await settle();
    assert.equal(await kvGet(k.db, 'role_id'), 'custom-runner');
    assert.ok((await k.node.permissions()).has('orders.markServed')); assert.ok(!(await k.node.permissions()).has('kitchen.updateStatus'));
    assert.equal((await w.parent.submit('ROLE_UPSERTED', 'role', 'role-admin', { name: 'x', permissions: [] })).reason, 'builtin_role');
    assert.equal((await w.parent.submit('ROLE_UPSERTED', 'role', 'c2', { name: 'x', permissions: ['bogus'] })).reason, 'bad_role');
  });

  await test('heartbeat lease: Child works only while the Parent heartbeat (and Parent license) is valid', async () => {
    const w = await world(); const k = await addChild(w, 'W', ROLE_WAITER);
    assert.equal((await k.node.status()).lease, 'ok');
    w.clock.t += LEASE_GRACE_MS - 1000; assert.equal((await k.node.status()).lease, 'ok', 'still inside grace');
    await w.parent.tick(); await settle(); w.clock.t += LEASE_GRACE_MS - 1000;
    assert.equal((await k.node.status()).lease, 'ok', 'a fresh heartbeat renews the lease');
    w.clock.t += 2000; assert.equal((await k.node.status()).lease, 'grace_expired');
    await rejects(k.node.submit('ORDER_CREATED', 'order', uuid(), { orderType: 'takeaway', note: '', items: [] }), 'lease_grace_expired');
    await w.parent.tick(); await settle(); assert.equal((await k.node.status()).lease, 'ok', 'works again once the Parent is back');
    // Parent license expires: heartbeats stop and the lease carries the expiry
    w.lic.validUntil = w.clock.t + 60_000; await w.parent.tick(); await settle();
    w.clock.t += 120_000; assert.equal((await k.node.status()).lease, 'license_expired');
    await w.parent.tick(); await settle(); assert.equal((await k.node.status()).lease, 'license_expired', 'expired Parent license is never renewed to Children');
    w.clock.t -= 24 * 3600_000; assert.equal((await k.node.status()).lease, 'clock', 'rolling the clock back locks the Child');
  });

  await test('Parent restart: sequence continues and Children resync from the persisted log', async () => {
    const w = await world(); const k = await addChild(w, 'W', ROLE_WAITER); await newOrder(w, k);
    const before = (await w.db.getFirstAsync<{ m: number }>('SELECT MAX(seq) AS m FROM events'))!.m;
    w.parent.stop(); await (k.transport as any).disconnect((k.transport as any).peers()[0]); await settle();
    const net2 = new MemoryNetwork(); const pt = net2.create(); await pt.start('parent', { serviceId: 'rpos', name: 'Parent-A' });
    const parent2 = new ParentNode({ db: w.db, transport: pt, networkId: w.networkId, deviceId: w.parentId, keys: w.keys, now: () => w.clock.t, license: () => w.lic });
    parent2.start(); await parent2.bootstrap('Test Cafe');
    assert.equal((await w.db.getFirstAsync<{ m: number }>('SELECT MAX(seq) AS m FROM events'))!.m, before, 'bootstrap is idempotent');
    const r = await parent2.submit('CATEGORY_UPSERTED', 'category', uuid(), { name: 'Drinks' }); assert.equal(r.seq, before + 1);
    const t2 = net2.create(); const k2 = new ChildNode({ db: k.db, transport: t2, deviceId: k.id, keys: k.keys, deviceName: 'W', now: () => w.clock.t });
    k2.start(); await k2.reconnect(); await settle();
    const st = await k2.status(); assert.ok(st.authed); assert.equal(st.lastSeq, before + 1);
    assert.equal((await k.db.getAllAsync('SELECT 1 FROM categories WHERE name = ?', ['Drinks'])).length, 1);
  });

  await test('children are refused when the Parent license does not allow them', async () => {
    const w = await world(); w.lic.allowChildren = false;
    const db = createNodeDb(); await migrate(db);
    const n = new ChildNode({ db, transport: w.net.create(), deviceId: uuid(), keys: newIdentity(), deviceName: 'X', now: () => w.clock.t }); n.start();
    await n.join(w.parent.openPairing('rpos', 'Parent-A')); await settle();
    assert.equal((await n.status()).membership, 'rejected');
  });

  console.log(`\n${passed} network tests passed`);
  process.exit(process.exitCode ?? 0);
}
void main();
