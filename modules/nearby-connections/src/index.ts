import { requireNativeModule } from 'expo-modules-core';

export interface NearbyNative {
  start(role: 'parent' | 'child', serviceId: string, name: string): Promise<void>;
  connect(endpointName: string, timeoutMs: number): Promise<string>;
  send(peerId: string, dataBase64: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onFrame', cb: (e: { peerId: string; data: string }) => void): { remove(): void };
  addListener(event: 'onPeer', cb: (e: { peerId: string; state: 'connecting' | 'connected' | 'disconnected' }) => void): { remove(): void };
  addListener(event: 'onAuthDigits', cb: (e: { peerId: string; digits: string }) => void): { remove(): void };
}
export default requireNativeModule<NearbyNative>('NearbyConnections');
