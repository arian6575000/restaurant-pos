// Child license lease. Only the Parent holds a product license. A Child stays operational while it keeps receiving
// the Parent's signed heartbeat, which carries the Parent's license validity. This is NOT a second licensing system:
// no license is issued, activated or verified here; the heartbeat only relays "the Parent's license is valid until X".

export const HEARTBEAT_INTERVAL_MS = 15_000;
/** How long a Child keeps working after the last heartbeat (Parent out of range / off). Adjustable product decision. */
export const LEASE_GRACE_MS = 12 * 60 * 60 * 1000;
const CLOCK_SLACK_MS = 5 * 60 * 1000;

export interface Heartbeat {
  networkId: string;
  parentTime: number;           // Parent clock, ms
  validUntil: number | null;    // Parent license expiry in ms; null = lifetime
  lastSeq: number;
}
export interface LeaseRecord {
  parentTime: number;
  receivedAt: number;           // Child clock when received
  validUntil: number | null;
}
export type LeaseStatus = 'ok' | 'none' | 'grace_expired' | 'license_expired' | 'clock';

export function evaluateLease(lease: LeaseRecord | null, now: number, lastSeen: number, graceMs = LEASE_GRACE_MS): LeaseStatus {
  if (!lease) return 'none';
  if (now + CLOCK_SLACK_MS < lastSeen || now + CLOCK_SLACK_MS < lease.receivedAt) return 'clock';   // clock moved backwards
  const elapsed = now - lease.receivedAt;
  if (elapsed > graceMs) return 'grace_expired';
  if (lease.validUntil !== null && lease.parentTime + elapsed > lease.validUntil) return 'license_expired';
  return 'ok';
}
export const leaseFrom = (hb: Heartbeat, receivedAt: number): LeaseRecord => ({ parentTime: hb.parentTime, receivedAt, validUntil: hb.validUntil });
