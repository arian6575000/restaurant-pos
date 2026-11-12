// License logic compatible with the RetailX License Hub format:
//   MPOS-LIC-<base64url(payload json)>.<base64url(ed25519 signature over those payload bytes)>
// Pure TypeScript (no Expo imports) so it runs in the app, in Node tests, and can be copied into client apps.
import nacl from "tweetnacl";
import { decodeBase64, encodeBase64 } from "tweetnacl-util";
export type FeatureMap = Record<string, boolean | string | number>;

export const PREFIX = "MPOS-LIC-";
// The Hub and the Generator may label keys with any of these; the signature (not the label) is what is trusted.
export const ACCEPTED_PREFIXES = ["MPOS-LIC-", "RETAILX-LIC-", "DPOS-LIC-"];
export const LIFETIME_DATE = "2099-12-31";

export type Payload = {
  machine_id: string;
  client_name: string;
  plan_name: string;
  max_users: number;
  created_at: string;
  expiry_date: string; // YYYY-MM-DD
  is_lifetime: boolean;
  features: FeatureMap;
  project_code?: string; // only for non-legacy projects
  license_id?: string; // only for non-legacy projects
};

// ---------- helpers ----------
const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
export const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// Python urlsafe_b64encode: keeps '=' padding
const b64u = (b: Uint8Array) => encodeBase64(b).replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s: string) => {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return decodeBase64(t);
};

// Same text as Python json.dumps(obj, sort_keys=True): ", " and ": " separators, ASCII-only.
function pyStr(s: string): string {
  let o = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') o += '\\"';
    else if (ch === "\\") o += "\\\\";
    else if (ch === "\n") o += "\\n";
    else if (ch === "\r") o += "\\r";
    else if (ch === "\t") o += "\\t";
    else if (ch === "\b") o += "\\b";
    else if (ch === "\f") o += "\\f";
    else if (c < 0x20 || c > 0x7f) {
      if (c > 0xffff) {
        const v = c - 0x10000;
        o += "\\u" + (0xd800 + (v >> 10)).toString(16).padStart(4, "0");
        o += "\\u" + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
      } else o += "\\u" + c.toString(16).padStart(4, "0");
    } else o += ch;
  }
  return o + '"';
}
export function pyJson(v: any): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
  return "{" + Object.keys(v).sort().map((k) => pyStr(k) + ": " + pyJson(v[k])).join(", ") + "}";
}

// ---------- keys (32-byte Ed25519 seed as hex, like RetailX ED25519_PRIVATE_KEY_HEX) ----------
export type KeyHex = { privateKeyHex: string; publicKeyHex: string };

export function isValidSeedHex(h: string) {
  return /^[0-9a-fA-F]{64}$/.test(h.trim());
}
export function publicKeyFromSeed(seedHex: string): string {
  return bytesToHex(nacl.sign.keyPair.fromSeed(hexToBytes(seedHex.trim())).publicKey);
}
export function generateKeyPair(): KeyHex {
  const seed = bytesToHex(nacl.randomBytes(32));
  return { privateKeyHex: seed, publicKeyHex: publicKeyFromSeed(seed) };
}

// ---------- ids / dates ----------
export function normalizeDeviceId(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (raw.length !== 20) return null;
  return raw.match(/.{4}/g)!.join("-");
}
export function formatDeviceIdFromHex(hex: string): string {
  return normalizeDeviceId(hex.slice(0, 20))!;
}
/** App-specific Device ID: "<Prefix>-XXXX-XXXX-XXXX" (12 hex). The prefix keeps IDs of different apps apart. */
export function formatAppDeviceId(prefix: string, hex: string): string {
  const p = prefix.trim();
  const h = hex.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 12);
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(p)) throw new Error("DEVICE_PREFIX must be letters/digits only (e.g. RetailXPOS)");
  if (h.length !== 12) throw new Error("need at least 12 hex characters");
  return `${p}-${h.match(/.{4}/g)!.join("-")}`;
}
export function newLicenseId(): string {
  return bytesToHex(nacl.randomBytes(5)).toUpperCase();
}
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));

// ---------- create ----------
export type BuildArgs = {
  machineId: string;
  clientName: string;
  planName: string;
  maxUsers: number;
  features: FeatureMap;
  expiry: { days: number } | { date: string } | "lifetime";
  idFormat: "any" | "hex20";
  project?: { code: string; legacy: boolean };
  now?: Date;
};

export function buildPayload(a: BuildArgs): Payload {
  const now = a.now ?? new Date();
  let machine = a.machineId.trim();
  if (!machine) throw new Error("Device / Machine ID likhna zaroori hai");
  if (a.idFormat === "hex20") {
    const n = normalizeDeviceId(machine);
    if (!n) throw new Error("Device ID galat hai (20 hex characters chahiye)");
    machine = n;
  }
  const client = a.clientName.trim();
  if (!client) throw new Error("Client name likhna zaroori hai");
  if (!Number.isFinite(a.maxUsers) || a.maxUsers < 1) throw new Error("Max users kam az kam 1");

  let expiry_date: string;
  let is_lifetime = false;
  if (a.expiry === "lifetime") {
    expiry_date = LIFETIME_DATE;
    is_lifetime = true;
  } else if ("days" in a.expiry) {
    if (!Number.isFinite(a.expiry.days) || a.expiry.days < 1) throw new Error("Din kam az kam 1 hon");
    expiry_date = isoDate(new Date(now.getTime() + Math.floor(a.expiry.days) * 86400000));
  } else {
    if (!isValidDate(a.expiry.date)) throw new Error("Date YYYY-MM-DD format mein likhein");
    if (a.expiry.date < isoDate(now)) throw new Error("Expiry date guzar chuki hai");
    expiry_date = a.expiry.date;
  }

  const p: Payload = {
    machine_id: machine,
    client_name: client,
    plan_name: a.planName,
    max_users: Math.floor(a.maxUsers),
    created_at: now.toISOString().replace("Z", "000"),
    expiry_date,
    is_lifetime,
    features: a.features,
  };
  if (a.project && !a.project.legacy) {
    p.project_code = a.project.code;
    p.license_id = newLicenseId();
  }
  return p;
}

export function signLicense(payload: Payload, privateKeyHex: string): string {
  const bytes = new TextEncoder().encode(pyJson(payload));
  const sk = nacl.sign.keyPair.fromSeed(hexToBytes(privateKeyHex.trim())).secretKey;
  const sig = nacl.sign.detached(bytes, sk);
  return `${PREFIX}${b64u(bytes)}.${b64u(sig)}`;
}

// ---------- verify (same logic goes into client apps) ----------
export type Reason = "format" | "signature" | "project" | "machine" | "expired" | "clock";
export type VerifyResult =
  | { ok: true; payload: Payload; daysLeft: number | null }
  | { ok: false; reason: Reason };

export function verifyLicense(
  license: string,
  opts: {
    publicKeyHex: string;
    machineId?: string; // pass this device's id to bind
    projectCode?: string; // pass your app's code to bind (checked only if license carries project_code)
    now?: number; // ms
    lastSeen?: number; // ms, clock rollback guard
  }
): VerifyResult {
  try {
    const key = license.trim();
    const prefix = ACCEPTED_PREFIXES.find((x) => key.toUpperCase().startsWith(x));
    if (!prefix) return { ok: false, reason: "format" };
    const parts = key.slice(prefix.length).split(".");
    if (parts.length !== 2) return { ok: false, reason: "format" };
    const body = unb64u(parts[0]);
    const sig = unb64u(parts[1]);
    if (!nacl.sign.detached.verify(body, sig, hexToBytes(opts.publicKeyHex.trim())))
      return { ok: false, reason: "signature" };
    const p = JSON.parse(new TextDecoder().decode(body)) as Payload;

    if (opts.projectCode && p.project_code && p.project_code !== opts.projectCode)
      return { ok: false, reason: "project" };
    if (opts.machineId !== undefined) {
      const norm = (s: string) => s.trim().toUpperCase();
      if (norm(p.machine_id) !== norm(opts.machineId)) return { ok: false, reason: "machine" };
    }
    const now = opts.now ?? Date.now();
    if (opts.lastSeen && now + 5 * 60000 < opts.lastSeen) return { ok: false, reason: "clock" };
    if (!p.is_lifetime) {
      const endOfDay = Date.parse(p.expiry_date.slice(0, 10) + "T23:59:59Z");
      if (now > endOfDay) return { ok: false, reason: "expired" };
      return { ok: true, payload: p, daysLeft: Math.max(0, Math.ceil((endOfDay - now) / 86400000)) };
    }
    return { ok: true, payload: p, daysLeft: null };
  } catch {
    return { ok: false, reason: "format" };
  }
}

export function hasFeature(p: Payload, key: string): boolean {
  return p.features?.[key] === true;
}
