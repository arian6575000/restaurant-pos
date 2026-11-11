// Pure core tests: order rules, permissions, signing, lease, framing. Run: tsx tests/core.test.ts
import assert from 'node:assert/strict';
import { calcTotals, canItemTransition, canOrderTransition, paymentState } from '../src/core/restaurant/order';
import { BUILTIN_ROLES, PERMISSIONS, ROLE_ADMIN, ROLE_CASHIER, ROLE_KITCHEN, ROLE_WAITER, permissionsOfRole } from '../src/core/permissions';
import { canonical, newIdentity, signObj, uuid, verifyObj } from '../src/core/util';
import { buildEvent, signAsParent, verifyDeviceSig, verifyParentSig } from '../src/core/events';
import { evaluateLease, LEASE_GRACE_MS } from '../src/core/network/lease';
import { Reassembler, splitFrames } from '../src/transport/framing';
import { decodeQr, encodeQr } from '../src/core/network/protocol';

// ---- totals (integer minor units) ----
assert.deepEqual(calcTotals([{ qty: 2, unitPrice: 25000 }, { qty: 1, unitPrice: 10000 }], 5000, 1600), { subtotal: 60000, discount: 5000, tax: 8800, total: 63800 });
assert.equal(calcTotals([{ qty: 1, unitPrice: 1000 }], 99999, 0).total, 0, 'discount cannot exceed subtotal');
assert.equal(calcTotals([{ qty: 3, unitPrice: 333 }], 0, 500).tax, 50, 'tax rounds to whole minor unit');
assert.equal(paymentState(1000, 0), 'unpaid'); assert.equal(paymentState(1000, 400), 'partial'); assert.equal(paymentState(1000, 1000), 'paid');

// ---- state machines ----
assert.ok(canOrderTransition('open', 'sent_to_kitchen')); assert.ok(canOrderTransition('ready', 'served')); assert.ok(canOrderTransition('served', 'closed'));
assert.ok(!canOrderTransition('open', 'served'), 'cannot skip steps');
assert.ok(!canOrderTransition('ready', 'open'), 'cannot go backwards');
assert.ok(!canOrderTransition('ready', 'cancelled') && !canOrderTransition('closed', 'cancelled'));
assert.ok(canItemTransition('sent', 'preparing') && !canItemTransition('ready', 'new') && !canItemTransition('served', 'voided'));

// ---- roles ----
const perms = (r: string) => permissionsOfRole(r, {});
assert.equal(perms(ROLE_ADMIN).size, PERMISSIONS.length);
assert.ok(perms(ROLE_KITCHEN).has('kitchen.updateStatus') && perms(ROLE_KITCHEN).has('orders.markReady'));
assert.ok(!perms(ROLE_KITCHEN).has('payments.record') && !perms(ROLE_KITCHEN).has('reports.view'), 'kitchen: no payments / reports');
assert.ok(perms(ROLE_WAITER).has('orders.create') && perms(ROLE_WAITER).has('orders.markServed') && !perms(ROLE_WAITER).has('devices.manage'));
assert.ok(perms(ROLE_CASHIER).has('payments.record') && !perms(ROLE_CASHIER).has('orders.create'));
assert.deepEqual([...permissionsOfRole('custom-1', { 'custom-1': ['orders.view', 'not.a.permission'] })], ['orders.view'], 'unknown permission strings are dropped');
assert.equal(permissionsOfRole('missing', {}).size, 0);
assert.ok(Object.values(BUILTIN_ROLES).every((r) => r.permissions.every((p) => (PERMISSIONS as readonly string[]).includes(p))));

// ---- signing ----
assert.equal(canonical({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const dev = newIdentity(), parent = newIdentity();
const ev = buildEvent({ networkId: 'n', deviceId: 'd', secretKey: dev.secretKey, type: 'ORDER_UPDATED', entityType: 'order', entityId: 'o', payload: { note: 'x' }, now: 1 });
assert.ok(verifyDeviceSig(ev, dev.publicKey));
assert.ok(!verifyDeviceSig({ ...ev, payload: { note: 'y' } }, dev.publicKey), 'tampered payload fails');
assert.ok(!verifyDeviceSig(ev, parent.publicKey), 'wrong key fails');
const sealed = signAsParent({ ...ev, seq: 7, meta: { orderNumber: 3 } }, parent.secretKey);
assert.ok(verifyParentSig(sealed, parent.publicKey));
assert.ok(!verifyParentSig({ ...sealed, seq: 8 }, parent.publicKey), 'seq is covered by the parent signature');
assert.ok(!verifyParentSig({ ...sealed, meta: { orderNumber: 4 } }, parent.publicKey), 'meta is covered by the parent signature');
assert.ok(!verifyObj('zz', {}, 'zz'), 'garbage keys do not throw');
assert.ok(verifyObj(dev.publicKey, { a: 1 }, signObj(dev.secretKey, { a: 1 })));

// ---- lease (Child works while the Parent heartbeat keeps arriving) ----
const T0 = 1_700_000_000_000;
const lease = { parentTime: T0, receivedAt: T0, validUntil: T0 + 30 * 86400_000 };
assert.equal(evaluateLease(null, T0, 0), 'none');
assert.equal(evaluateLease(lease, T0 + 1000, T0), 'ok');
assert.equal(evaluateLease(lease, T0 + LEASE_GRACE_MS + 1, T0), 'grace_expired');
assert.equal(evaluateLease({ ...lease, validUntil: T0 + 1000 }, T0 + 5000, T0), 'license_expired');
assert.equal(evaluateLease({ ...lease, validUntil: null }, T0 + 3600_000, T0), 'ok', 'lifetime parent license');
assert.equal(evaluateLease(lease, T0 - 3600_000, T0), 'clock', 'clock rolled back');

// ---- framing ----
const rnd = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255; return b; };
const msg = rnd(100_000), id = rnd(16);
const frames = splitFrames(msg, 4096, id);
assert.ok(frames.length > 20 && frames.every((f) => f.length <= 4096));
const re = new Reassembler(); let got: Uint8Array | null = null;
const shuffled = [...frames].reverse(); shuffled.splice(3, 0, shuffled[0]);   // out of order + a duplicate chunk
for (const f of shuffled) { const r = re.push(f); if (r) got = r; }
assert.ok(got && got.length === msg.length && got.every((b, i) => b === msg[i]), 'reassembles out-of-order frames with duplicates');
assert.equal(new Reassembler().push(splitFrames(new Uint8Array(0), 64, id)[0])?.length, 0, 'empty message round-trips');

// ---- QR ----
const qr = { v: 1 as const, networkId: 'n', parentDeviceId: 'p', parentPublicKey: 'k', serviceId: 's', endpointName: 'e', nonce: 'x', expiresAt: 5 };
assert.deepEqual(decodeQr(encodeQr(qr)), qr); assert.equal(decodeQr('hello'), null); assert.equal(decodeQr('{"v":2}'), null);

console.log('core tests passed');
