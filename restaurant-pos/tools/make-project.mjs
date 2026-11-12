// Run:  node tools/make-project.mjs          (first time: creates keys; later: refreshes the Hub JSON)
// Creates (git-ignored folder .license/):
//   restaurant-pos.keys.json     -> private + public key. KEEP PRIVATE, back it up (password manager).
//   restaurant-pos.project.json  -> ready body for the License Hub: POST /api/v1/admin/projects  (Projects > Add project)
// And writes the PUBLIC key into src/license/config.ts. Private key never enters the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nacl = require('tweetnacl');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hex = (u8) => Buffer.from(u8).toString('hex');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/license/permissions.json'), 'utf8'));
const code = spec.project.code;
const dir = path.join(root, '.license');
fs.mkdirSync(dir, { recursive: true });

const keyFile = path.join(dir, `${code}.keys.json`);
let keys;
if (fs.existsSync(keyFile)) {
  keys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  console.log('Existing keys reused:', keyFile);
} else {
  const seed = nacl.randomBytes(32); // Ed25519 private key = 32-byte seed (same format as the Hub / Generator)
  const kp = nacl.sign.keyPair.fromSeed(seed);
  keys = { code, private_key: hex(seed), public_key: hex(kp.publicKey), created_at: new Date().toISOString() };
  fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
  console.log('NEW keys created:', keyFile, '\n  -> back this file up somewhere safe. If it is lost, new licenses cannot be made.');
}
// sanity: private matches public
if (hex(nacl.sign.keyPair.fromSeed(Buffer.from(keys.private_key, 'hex')).publicKey) !== keys.public_key) throw new Error('keys.json: private/public mismatch');

const default_features = Object.fromEntries(spec.permission_schema.flatMap((m) => m.features.map((f) => [f.key, f.default])));
const body = { ...spec.project, public_key: keys.public_key, private_key: keys.private_key, permission_schema: spec.permission_schema, default_features, is_active: true };
fs.writeFileSync(path.join(dir, `${code}.project.json`), JSON.stringify(body, null, 2));

const cfg = path.join(root, 'src/license/config.ts');
let s = fs.readFileSync(cfg, 'utf8');
s = s.replace(/export const PUBLIC_KEY_HEX = "[^"]*";/, `export const PUBLIC_KEY_HEX = "${keys.public_key}";`);
fs.writeFileSync(cfg, s);

console.log(`\nPublic key written to src/license/config.ts:\n  ${keys.public_key}\n`);
console.log(`Hub JSON ready: .license/${code}.project.json  (has the PRIVATE key - paste into Hub only, never commit/share)`);
