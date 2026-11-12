// Device ID for Expo / React Native client apps for Restaurant POS (Android).
// Format: "<DEVICE_PREFIX>-XXXX-XXXX-XXXX". The hash includes the app prefix, so the SAME phone gets a DIFFERENT ID in every app.
import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Crypto from "expo-crypto";
import { formatAppDeviceId, formatDeviceIdFromHex } from "./licenseCore";
import { DEVICE_PREFIX } from "./config";

let cached: string | null = null;
let cachedLegacy: string | null = null;

async function parts(): Promise<string> {
  const stableId =
    Platform.OS === "android"
      ? Application.getAndroidId() ?? ""
      : (await Application.getIosIdForVendorAsync()) ?? "";
  return [
    Platform.OS, stableId, Device.brand ?? "", Device.manufacturer ?? "", Device.modelName ?? "",
    (Device.supportedCpuArchitectures ?? []).join(","),
  ].join("|");
}
const sha = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const hex = await sha(`MPOS-DEVID-v2|${DEVICE_PREFIX}|` + (await parts()));
  cached = formatAppDeviceId(DEVICE_PREFIX, hex);
  return cached;
}

/** Old app-independent ID (20 hex). Only used when ACCEPT_LEGACY_DEVICE_ID is on, for licenses issued before the prefix existed. */
export async function getLegacyDeviceId(): Promise<string> {
  if (cachedLegacy) return cachedLegacy;
  cachedLegacy = formatDeviceIdFromHex((await sha("MPOS-DEVID-v1|" + (await parts()))).toUpperCase());
  return cachedLegacy;
}
