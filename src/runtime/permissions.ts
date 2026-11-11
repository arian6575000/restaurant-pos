// Android runtime permissions needed by Nearby Connections (varies by API level). No extra dependency: uses React Native's PermissionsAndroid.
import { PermissionsAndroid, Platform } from 'react-native';
import { AppError } from '../core/util';

export async function ensureNearbyPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const api = Number(Platform.Version);
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = api >= 33
    ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT, P.NEARBY_WIFI_DEVICES]
    : api >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT, P.ACCESS_FINE_LOCATION]
    : [P.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted.filter(Boolean) as any);
  const denied = Object.entries(res).filter(([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED).map(([k]) => k);
  if (denied.length) throw new AppError('permissions_denied', `Permission denied: ${denied.map((d) => d.split('.').pop()).join(', ')}`);
}
