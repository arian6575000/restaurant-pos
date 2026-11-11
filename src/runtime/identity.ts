// Per-device identity: random device id + Ed25519 key pair, kept in the Android Keystore (expo-secure-store).
// Separate from the license machine id: this identifies the device inside a restaurant network.
import * as SecureStore from 'expo-secure-store';
import { newIdentity, uuid, type Identity } from '../core/util';

const K = 'rpos_node_identity';
const O = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export interface NodeIdentity { deviceId: string; keys: Identity }

export async function loadIdentity(): Promise<NodeIdentity> {
  const s = await SecureStore.getItemAsync(K, O);
  if (s) { try { const v = JSON.parse(s); if (v?.deviceId && v?.keys?.secretKey) return v; } catch { /* regenerate */ } }
  const id: NodeIdentity = { deviceId: uuid(), keys: newIdentity() };
  await SecureStore.setItemAsync(K, JSON.stringify(id), O);
  return id;
}
export async function resetIdentity(): Promise<void> { await SecureStore.deleteItemAsync(K, O); }
