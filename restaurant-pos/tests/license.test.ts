import assert from 'node:assert/strict';
import { buildPayload, generateKeyPair, signLicense, verifyLicense, formatAppDeviceId } from '../src/license/licenseCore';

const kp = generateKeyPair();
const other = generateKeyPair();
const DEV = 'AAAA-BBBB-CCCC-DDDD-EEEE';
const mk = (project = 'darzihub', expiry: any = { days: 30 }, now?: Date) =>
  signLicense(buildPayload({ machineId: DEV, clientName: 'Test Tailor', planName: 'Pro', maxUsers: 1, features: {}, expiry, idFormat: 'hex20', project: { code: project, legacy: false }, now }), kp.privateKeyHex);
const v = (lic: string, o: any = {}) => verifyLicense(lic, { publicKeyHex: kp.publicKeyHex, machineId: DEV, projectCode: 'darzihub', ...o });

// valid
let r = v(mk()); assert.equal(r.ok, true);
// lifetime
r = v(mk('darzihub', 'lifetime')); assert.equal(r.ok && r.daysLeft, null);
// wrong key
assert.deepEqual(verifyLicense(mk(), { publicKeyHex: other.publicKeyHex, machineId: DEV, projectCode: 'darzihub' }), { ok: false, reason: 'signature' });
// other device
assert.deepEqual(v(mk(), { machineId: '1111-2222-3333-4444-5555' }), { ok: false, reason: 'machine' });
// other project
assert.deepEqual(v(mk('bpjourney')), { ok: false, reason: 'project' });
// expired
assert.deepEqual(v(mk(), { now: Date.now() + 40 * 86400000 }), { ok: false, reason: 'expired' });
// clock rollback
assert.deepEqual(v(mk(), { lastSeen: Date.now() + 3 * 86400000 }), { ok: false, reason: 'clock' });
// tampered payload
const lic = mk(); const [h, sig] = lic.split('.');
const bad = h.slice(0, -4) + (h.endsWith('AAAA') ? 'BBBB' : 'AAAA') + '.' + sig;
assert.equal(v(bad).ok, false);
// garbage
assert.deepEqual(v('hello'), { ok: false, reason: 'format' });

// Hub-style key (RetailX-LIC- prefix, standard base64, no project_code) signed with the real DarziHub project key
const HUB_PUB = '9c646b9a4b22ac15a5f1ef4084f9ab599bc9eec4b02c9efa4bba7c61572ff507';
const HUB_KEY = 'RetailX-LIC-eyJjbGllbnRfbmFtZSI6ICJBUSIsICJjcmVhdGVkX2F0IjogIjIwMjYtMTEtMDdUMTA6NTY6MzUuMDE1NzA3IiwgImV4cGlyeV9kYXRlIjogIjIwMjYtMTItMDciLCAiZmVhdHVyZXMiOiB7ImFjY291bnRpbmciOiB0cnVlLCAiYWNjb3VudGluZy5iYW5raW5nIjogZmFsc2UsICJhY2NvdW50aW5nLmNhc2hfaW5fb3V0IjogdHJ1ZSwgImFjY291bnRpbmcuY2hhcnRfb2ZfYWNjb3VudHMiOiBmYWxzZSwgImFjY291bnRpbmcuZXhwZW5zZXMiOiB0cnVlLCAiYWNjb3VudGluZy5qb3VybmFsIjogZmFsc2UsICJhY2NvdW50aW5nLmxlZGdlciI6IGZhbHNlLCAiYWNjb3VudGluZy5vdmVydmlldyI6IHRydWUsICJhY2NvdW50aW5nLnJlcG9ydHMiOiBmYWxzZSwgImFjdGl2YXRpb24iOiB0cnVlLCAiY2xvdWRfc3luYyI6IHRydWUsICJjdXN0b21lcnMiOiB0cnVlLCAiY3VzdG9tZXJzLmNhc2hfaW5fb3V0IjogdHJ1ZSwgImN1c3RvbWVycy5jcmVhdGUiOiB0cnVlLCAiY3VzdG9tZXJzLmxlZGdlciI6IHRydWUsICJjdXN0b21lcnMudmlldyI6IHRydWUsICJkYXNoYm9hcmQiOiB0cnVlLCAiZGFzaGJvYXJkLmZpbmFuY2lhbHMiOiB0cnVlLCAiZGFzaGJvYXJkLmxvd19zdG9jayI6IHRydWUsICJkYXNoYm9hcmQuc3RhdHMiOiB0cnVlLCAiZGlzcGxheSI6IHRydWUsICJoaXN0b3J5IjogdHJ1ZSwgImhpc3RvcnkucmVwb3J0cyI6IHRydWUsICJoaXN0b3J5LnJlcHJpbnQiOiB0cnVlLCAiaGlzdG9yeS5yZXR1cm5zIjogdHJ1ZSwgImhpc3RvcnkudmlldyI6IHRydWUsICJob2xkX29yZGVycyI6IHRydWUsICJpbnZlbnRvcnkiOiB0cnVlLCAiaW52ZW50b3J5LmJhdGNoZXMiOiBmYWxzZSwgImludmVudG9yeS5jYXRlZ29yaWVzIjogdHJ1ZSwgImludmVudG9yeS5leHBpcnkiOiBmYWxzZSwgImludmVudG9yeS5wcm9kdWN0X2FkZCI6IHRydWUsICJpbnZlbnRvcnkucHJvZHVjdF9kZWxldGUiOiB0cnVlLCAiaW52ZW50b3J5LnByb2R1Y3RfZWRpdCI6IHRydWUsICJpbnZlbnRvcnkuc3RvY2tfYWRqdXN0IjogdHJ1ZSwgImludmVudG9yeS52aWV3IjogdHJ1ZSwgImxhYmVscyI6IHRydWUsICJwb3MiOiB0cnVlLCAicG9zLmJpbGxpbmciOiB0cnVlLCAicG9zLmNyZWRpdF9zYWxlIjogdHJ1ZSwgInBvcy5kaXJlY3RfcHJpbnQiOiB0cnVlLCAicG9zLmRpc2NvdW50IjogdHJ1ZSwgInBvcy5lZGl0X3ByaWNlIjogdHJ1ZSwgInBvcy5ob2xkX29yZGVycyI6IHRydWUsICJwb3MucXVpY2tfYWRkX3Byb2R1Y3QiOiB0cnVlLCAicG9zLnZvaWRfaXRlbSI6IHRydWUsICJwcmludC5hbGxfc2l6ZXMiOiB0cnVlLCAicHJpbnQucmVtb3ZlX2JyYW5kaW5nIjogZmFsc2UsICJwcmludC50aGVybWFsX29ubHkiOiBmYWxzZSwgInByaW50X2N1c3RvbWl6YXRpb24uZGVzaWduZXIiOiBmYWxzZSwgInByaW50X3NldHRpbmdzIjogdHJ1ZSwgInByaW50X3RlbXBsYXRlcyI6IHRydWUsICJwcmludF90ZW1wbGF0ZXMudmlwX2V4dHJhIjogZmFsc2UsICJwcm9maWxlIjogdHJ1ZSwgInB1cmNoYXNlcyI6IHRydWUsICJwdXJjaGFzZXMuY3JlYXRlIjogdHJ1ZSwgInB1cmNoYXNlcy5yZXR1cm5zIjogdHJ1ZSwgInB1cmNoYXNlcy5zdXBwbGllcnMiOiB0cnVlLCAicHVyY2hhc2VzLnZpZXciOiB0cnVlLCAicmVwb3J0cyI6IHRydWUsICJyZXBvcnRzLmFkdmFuY2VkIjogZmFsc2UsICJyZXBvcnRzLmJhc2ljIjogdHJ1ZSwgInJlcG9ydHMuc3RhbmRhcmQiOiBmYWxzZSwgInJlcG9ydHMudGllciI6ICJiYXNpYyIsICJzYWxlcyI6IHRydWUsICJzYWxlcy5jaGFsbGFuIjogZmFsc2UsICJzYWxlcy5pbnZvaWNlcyI6IHRydWUsICJzYWxlcy5xdW90YXRpb25zIjogZmFsc2UsICJzZXR0aW5ncyI6IHRydWUsICJzZXR0aW5ncy5hY3RpdmF0aW9uIjogdHJ1ZSwgInNldHRpbmdzLmRpc3BsYXkiOiB0cnVlLCAic2V0dGluZ3MucHJpbnRfc2V0dGluZ3MiOiB0cnVlLCAic2V0dGluZ3MucHJvZmlsZSI6IHRydWUsICJzZXR0aW5ncy53b3Jrc3BhY2UiOiB0cnVlLCAidGF4ZXMiOiB0cnVlLCAidW5pdHMiOiB0cnVlLCAidXNlcnMiOiB0cnVlLCAidmFyaWFudHMiOiB0cnVlLCAid2FyZWhvdXNlIjogdHJ1ZSwgIndhcmVob3VzZS5jcmVhdGUiOiB0cnVlLCAid2FyZWhvdXNlLnRyYW5zZmVyIjogZmFsc2UsICJ3YXJlaG91c2UudmlldyI6IHRydWUsICJ3b3Jrc3BhY2UiOiB0cnVlLCAiem9vbSI6IHRydWV9LCAiaXNfbGlmZXRpbWUiOiBmYWxzZSwgIm1hY2hpbmVfaWQiOiAiOTEwNy03RkUzLTRDNkMtMEREMy01OTAxIiwgIm1heF91c2VycyI6IDUsICJwbGFuX25hbWUiOiAic3RhbmRhcmQifQ==.fSGE6DF1NPnnhskUdZeAGOwSaru-tDMssS3f9vzPoWeqG3HyOwhlIqQ07sqwLfAjA4gdKykw2uCJsBe8kxvkDQ==';
const hubNow = Date.parse('2026-11-08T00:00:00Z');
assert.equal(verifyLicense(HUB_KEY, { publicKeyHex: HUB_PUB, machineId: '9107-7FE3-4C6C-0DD3-5901', projectCode: 'darzihub', now: hubNow }).ok, true);
assert.deepEqual(verifyLicense(HUB_KEY, { publicKeyHex: HUB_PUB, machineId: '1111-2222-3333-4444-5555', projectCode: 'darzihub', now: hubNow }), { ok: false, reason: 'machine' });
assert.deepEqual(verifyLicense(HUB_KEY, { publicKeyHex: kp.publicKeyHex, machineId: '9107-7FE3-4C6C-0DD3-5901', now: hubNow }), { ok: false, reason: 'signature' });
assert.equal(verifyLicense('RETAILX-LIC-' + HUB_KEY.slice(12), { publicKeyHex: HUB_PUB, machineId: '9107-7FE3-4C6C-0DD3-5901', now: hubNow }).ok, true);
console.log('license tests passed');

// ---- app-specific device IDs: same phone, different app => different ID, and a license for one app never opens another ----
const HEX = '87A9F285E2DF1234ABCD';
assert.equal(formatAppDeviceId('RetailXPOS', HEX), 'RetailXPOS-87A9-F285-E2DF');
assert.notEqual(formatAppDeviceId('DarziHub', HEX), formatAppDeviceId('RetailXPOS', HEX));
assert.throws(() => formatAppDeviceId('Retail X', HEX));
assert.throws(() => formatAppDeviceId('RetailXPOS', 'ABC'));
{
  const idA = 'DarziHub-87A9-F285-E2DF', idB = 'RetailXPOS-87A9-F285-E2DF';
  const licA = signLicense(buildPayload({ machineId: idA, clientName: 'C', planName: 'Pro', maxUsers: 1, features: {}, expiry: { days: 30 }, idFormat: 'any', project: { code: 'darzihub', legacy: false } }), kp.privateKeyHex);
  assert.equal(verifyLicense(licA, { publicKeyHex: kp.publicKeyHex, machineId: idA, projectCode: 'darzihub' }).ok, true);
  assert.deepEqual(verifyLicense(licA, { publicKeyHex: kp.publicKeyHex, machineId: idB, projectCode: 'darzihub' }), { ok: false, reason: 'machine' });
  assert.equal(verifyLicense(licA, { publicKeyHex: kp.publicKeyHex, machineId: idA.toLowerCase(), projectCode: 'darzihub' }).ok, true);
}
console.log('license device-id tests passed');
