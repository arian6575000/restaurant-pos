// Abstract transport. Business logic (core/) depends only on this interface; Nearby Connections is one implementation.
export type PeerState = 'connecting' | 'connected' | 'disconnected';
export type Unsub = () => void;

export interface Transport {
  /** Parent advertises, Child discovers. `serviceId` scopes discovery to this app. */
  start(role: 'parent' | 'child', opts: { serviceId: string; name: string }): Promise<void>;
  stop(): Promise<void>;
  /** Child: connect to a discovered/advertised endpoint by its advertised name. */
  connect(endpointName: string): Promise<void>;
  /** Resolves when the frame was HANDED to the transport. It does NOT mean the peer received it. */
  send(peerId: string, frame: Uint8Array): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  onFrame(cb: (peerId: string, frame: Uint8Array) => void): Unsub;
  onPeer(cb: (peerId: string, state: PeerState) => void): Unsub;
  /** Short digits both sides can compare to detect a man-in-the-middle (Nearby authentication token). */
  onAuthDigits?(cb: (peerId: string, digits: string) => void): Unsub;
}
