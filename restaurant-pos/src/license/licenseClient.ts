// License check for Restaurant POS (offline, Ed25519). Storage: Android Keystore via expo-secure-store.
import * as SecureStore from "expo-secure-store";
import { hasFeature, Payload, Reason, verifyLicense, VerifyResult } from "./licenseCore";
import { getDeviceId, getLegacyDeviceId } from "./deviceId";
import { ACCEPT_LEGACY_DEVICE_ID, KEY_CONFIGURED, PROJECT_CODE, PUBLIC_KEY_HEX } from "./config";

export type CheckResult = VerifyResult | { ok: false; reason: "config" };

const K_LICENSE = "mpos_license";
const K_LASTSEEN = "mpos_lastseen";
const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function check(license: string): Promise<CheckResult> {
  if (!KEY_CONFIGURED) return { ok: false, reason: "config" };
  const seen = await SecureStore.getItemAsync(K_LASTSEEN, opts);
  const lastSeen = seen ? parseInt(seen, 10) || undefined : undefined;
  const base = { publicKeyHex: PUBLIC_KEY_HEX, projectCode: PROJECT_CODE, lastSeen };
  let r = verifyLicense(license, { ...base, machineId: await getDeviceId() });
  if (!r.ok && r.reason === "machine" && ACCEPT_LEGACY_DEVICE_ID) r = verifyLicense(license, { ...base, machineId: await getLegacyDeviceId() });
  // The signing key is specific to this project, so a Hub key without project_code is valid; one with a different project_code is rejected inside verifyLicense.
  if (r.ok) await SecureStore.setItemAsync(K_LASTSEEN, String(Math.max(Date.now(), lastSeen ?? 0)), opts);
  return r;
}

/** User pasted a license: save it only if valid. */
export async function activateLicense(license: string): Promise<CheckResult> {
  const r = await check(license);
  if (r.ok) await SecureStore.setItemAsync(K_LICENSE, license.trim(), opts);
  return r;
}

/** Call on every app start and when the app returns to foreground. */
export async function checkSavedLicense(): Promise<CheckResult> {
  let saved: string | null = null;
  try { saved = await SecureStore.getItemAsync(K_LICENSE, opts); } catch { /* keystore unavailable */ }
  if (!saved) return { ok: false, reason: "format" };
  return check(saved);
}

export const can = (p: Payload, feature: string) => hasFeature(p, feature);

export const REASON_KEYS: Record<Reason | "config", string> = {
  format: "licFormat", signature: "licSignature", project: "licProject", machine: "licMachine", expired: "licExpired", clock: "licClock", config: "licConfig",
};
