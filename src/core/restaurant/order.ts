// Restaurant order rules: state machines, totals, payments. Pure functions; money is integer minor units.

export type OrderStatus = 'open' | 'sent_to_kitchen' | 'in_preparation' | 'ready' | 'served' | 'closed' | 'cancelled';
export type ItemStatus = 'new' | 'sent' | 'preparing' | 'ready' | 'served' | 'voided';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentState = 'unpaid' | 'partial' | 'paid';

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  open: ['sent_to_kitchen', 'cancelled'],
  sent_to_kitchen: ['in_preparation', 'cancelled'],
  in_preparation: ['ready', 'cancelled'],
  ready: ['served'],
  served: ['closed'],
  closed: [],
  cancelled: [],
};
export const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  new: ['sent', 'voided'],
  sent: ['preparing', 'voided'],
  preparing: ['ready'],
  ready: ['served'],
  served: [],
  voided: [],
};
export const canOrderTransition = (from: OrderStatus, to: OrderStatus): boolean => ORDER_TRANSITIONS[from]?.includes(to) ?? false;
export const canItemTransition = (from: ItemStatus, to: ItemStatus): boolean => ITEM_TRANSITIONS[from]?.includes(to) ?? false;
/** Items may still be added while the kitchen has not finished the order. */
export const ORDER_ACCEPTS_ITEMS: OrderStatus[] = ['open', 'sent_to_kitchen', 'in_preparation'];

export interface Totals { subtotal: number; discount: number; tax: number; total: number }
export function calcTotals(items: { qty: number; unitPrice: number }[], discount: number, taxBps: number): Totals {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const d = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const after = subtotal - d;
  const tax = Math.round((after * Math.max(0, taxBps)) / 10000);
  return { subtotal, discount: d, tax, total: after + tax };
}
export function paymentState(total: number, paid: number): PaymentState {
  if (paid <= 0) return 'unpaid';
  return paid >= total ? 'paid' : 'partial';
}
