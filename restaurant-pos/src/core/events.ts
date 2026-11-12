// Event envelope, types, signing. Every state change in the restaurant network is an event.
import { canonical, signObj, uuid, verifyObj } from './util';

export const EVENT_VERSION = 1;

export const EVENT_TYPES = [
  'ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_STATUS_CHANGED', 'ORDER_ITEM_ADDED', 'ORDER_ITEM_REMOVED', 'ORDER_ITEM_STATUS_CHANGED',
  'PAYMENT_RECORDED', 'PAYMENT_VOIDED', 'TABLE_UPSERTED', 'TABLE_STATUS_CHANGED', 'PRODUCT_UPSERTED', 'CATEGORY_UPSERTED',
  'ROLE_UPSERTED', 'SETTINGS_UPDATED', 'DEVICE_JOINED', 'DEVICE_ROLE_UPDATED', 'DEVICE_REVOKED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type EntityType = 'order' | 'order_item' | 'payment' | 'table' | 'product' | 'category' | 'role' | 'settings' | 'device';

/** Delivery state of an event on the device that holds it. */
export type EventState = 'pending' | 'sent' | 'acked' | 'accepted' | 'rejected';

export interface EventEnvelope {
  eventId: string;
  networkId: string;
  deviceId: string;
  type: EventType;
  entityType: EntityType;
  entityId: string;
  payload: Record<string, any>;
  createdAt: number;
  eventVersion: number;
  baseVersion: number;
  /** Assigned by the Parent on acceptance. */
  seq?: number;
  /** Values the Parent decides (e.g. order number). Covered by parentSig, not by the device signature. */
  meta?: Record<string, any>;
  signature: string;
  parentSig?: string;
}

const deviceBody = (e: EventEnvelope) => ({
  eventId: e.eventId, networkId: e.networkId, deviceId: e.deviceId, type: e.type, entityType: e.entityType, entityId: e.entityId,
  payload: e.payload, createdAt: e.createdAt, eventVersion: e.eventVersion, baseVersion: e.baseVersion,
});
const parentBody = (e: EventEnvelope) => ({ ...deviceBody(e), signature: e.signature, seq: e.seq, meta: e.meta ?? {} });

export function buildEvent(args: {
  networkId: string; deviceId: string; secretKey: string; type: EventType; entityType: EntityType; entityId: string;
  payload: Record<string, any>; now: number; baseVersion?: number;
}): EventEnvelope {
  const e: EventEnvelope = {
    eventId: uuid(), networkId: args.networkId, deviceId: args.deviceId, type: args.type, entityType: args.entityType,
    entityId: args.entityId, payload: args.payload, createdAt: args.now, eventVersion: EVENT_VERSION,
    baseVersion: args.baseVersion ?? 0, signature: '',
  };
  e.signature = signObj(args.secretKey, deviceBody(e));
  return e;
}
export const verifyDeviceSig = (e: EventEnvelope, publicKey: string): boolean => !!e.signature && verifyObj(publicKey, deviceBody(e), e.signature);
export function signAsParent(e: EventEnvelope, parentSecretKey: string): EventEnvelope {
  return { ...e, parentSig: signObj(parentSecretKey, parentBody(e)) };
}
export const verifyParentSig = (e: EventEnvelope, parentPublicKey: string): boolean =>
  !!e.parentSig && e.seq !== undefined && verifyObj(parentPublicKey, parentBody(e), e.parentSig);
export const eventFingerprint = (e: EventEnvelope): string => canonical(deviceBody(e));
