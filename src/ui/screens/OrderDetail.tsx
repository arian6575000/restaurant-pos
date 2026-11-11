import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Chips, Divider, Field, KV, ListItem, Muted, Row, Screen, SectionLabel, Sheet, T, IconButton, Loading } from '../kit';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { useLoad } from '../../lib/hooks';
import { getPayments, listTables, orderSummary } from '../../core/restaurant/store';
import { uuid } from '../../core/util';
import { moneyMinor, parseMinor } from '../../lib/format';
import { ITEM_LABEL, ORDER_LABEL, ORDER_TYPE_LABEL } from '../../lib/labels';
import { ORDER_ACCEPTS_ITEMS, type OrderStatus } from '../../core/restaurant/order';

type Method = 'cash' | 'card' | 'online' | 'other';

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession(); const { toast, confirm } = useApp();
  const [paying, setPaying] = useState(false); const [amount, setAmount] = useState(''); const [method, setMethod] = useState<Method>('cash');
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false);

  const [d, reload] = useLoad(async () => {
    const db = s.db!; const sum = await orderSummary(db, id); if (!sum) return null;
    return { sum, pays: await getPayments(db, id), table: (await listTables(db)).find((t) => t.id === sum.order.table_id)?.name ?? '',
      products: await db.getAllAsync<{ id: string; name: string; price: number }>('SELECT id, name, price FROM products WHERE deleted = 0 AND available = 1 ORDER BY name') };
  }, [s.rev, id]);
  if (!d) return <Screen title="Order" back><Loading /></Screen>;
  const { order, items, totals, paid, balance, payment } = d.sum; const st = order.status as OrderStatus;

  const send = async (type: any, et: any, eid: string, payload: Record<string, any>, ok?: string) => {
    setBusy(true); const r = await s.run(type, et, eid, payload); setBusy(false);
    if (!r.ok) toast(reasonText(r.reason), 'error'); else if (ok) toast(ok, 'success');
    await reload(); return r.ok;
  };
  const move = (to: OrderStatus, ok?: string) => send('ORDER_STATUS_CHANGED', 'order', order.id, { from: st, to }, ok);

  const actions: { label: string; icon: any; perm: any; to: OrderStatus; variant?: 'danger' | 'ghost' }[] = [];
  if (st === 'open') actions.push({ label: 'Send to kitchen', icon: 'flame', perm: 'orders.submit', to: 'sent_to_kitchen' });
  if (st === 'sent_to_kitchen') actions.push({ label: 'Start preparing', icon: 'restaurant', perm: 'kitchen.updateStatus', to: 'in_preparation' });
  if (st === 'in_preparation') actions.push({ label: 'Mark ready', icon: 'checkmark-done', perm: 'orders.markReady', to: 'ready' });
  if (st === 'ready') actions.push({ label: 'Mark served', icon: 'restaurant', perm: 'orders.markServed', to: 'served' });
  if (st === 'served' && payment === 'paid') actions.push({ label: 'Close order', icon: 'lock-closed', perm: 'orders.close', to: 'closed' });
  const canCancel = ['open', 'sent_to_kitchen', 'in_preparation'].includes(st) && paid === 0 && s.can('orders.cancel');
  const canEdit = ORDER_ACCEPTS_ITEMS.includes(st) && s.can('orders.update');
  const canPay = st !== 'cancelled' && st !== 'closed' && balance > 0 && s.can('payments.record');

  const pay = async () => {
    const m = parseMinor(amount); if (!m) { toast('Enter a valid amount', 'error'); return; }
    if (await send('PAYMENT_RECORDED', 'payment', uuid(), { orderId: order.id, amount: m, method }, 'Payment recorded')) setPaying(false);
  };

  return (
    <Screen title={`Order #${order.number ?? '…'}`} subtitle={`${ORDER_TYPE_LABEL[order.order_type]}${d.table ? ` · ${d.table}` : ''}`} back onRefresh={reload} right={<Badge status={st} label={ORDER_LABEL[st]} />}>
      <SectionLabel right={canEdit ? <Button small variant="ghost" icon="add" label="Add item" onPress={() => setAdding(true)} /> : undefined}>Items</SectionLabel>
      <Card flush>
        {items.filter((i) => !i.voided).length === 0 ? <Muted style={{ padding: 14 }}>No items yet.</Muted> : items.filter((i) => !i.voided).map((i, k, arr) => (
          <ListItem key={i.id} last={k === arr.length - 1} title={`${i.qty} × ${i.name}`} sub={ITEM_LABEL[i.status]}
            trail={<Row gap={6}><T bold>{moneyMinor(i.qty * i.unit_price)}</T>{canEdit || (s.can('items.void') && ORDER_ACCEPTS_ITEMS.includes(st)) ? <IconButton icon="trash-outline" color="#FF4757" onPress={async () => { if (await confirm(`Remove ${i.name}?`, { danger: true, okLabel: 'Remove' })) await send('ORDER_ITEM_REMOVED', 'order_item', i.id, { itemId: i.id }); }} /> : null}</Row>} />
        ))}
      </Card>

      <SectionLabel>Bill</SectionLabel>
      <Card>
        <KV k="Subtotal" v={moneyMinor(totals.subtotal)} />
        {totals.discount > 0 ? <KV k="Discount" v={`-${moneyMinor(totals.discount)}`} /> : null}
        <KV k={`Tax${order.tax_bps ? ` (${(order.tax_bps / 100).toFixed(order.tax_bps % 100 ? 2 : 0)}%)` : ''}`} v={moneyMinor(totals.tax)} />
        <Divider /><KV k="Total" v={moneyMinor(totals.total)} />
        <KV k="Paid" v={moneyMinor(paid)} /><KV k="Balance due" v={moneyMinor(balance)} vColor={balance > 0 ? '#FF4757' : '#14C48B'} />
      </Card>
      {d.pays.filter((p) => !p.voided).length > 0 && (
        <Card flush style={{ marginTop: 10 }}>{d.pays.filter((p) => !p.voided).map((p, i, a) => (
          <ListItem key={p.id} last={i === a.length - 1} title={moneyMinor(p.amount)} sub={p.method.toUpperCase()}
            trail={s.can('payments.void') && st !== 'closed' ? <Button small variant="danger" label="Void" onPress={async () => { if (await confirm('Void this payment?', { danger: true, okLabel: 'Void' })) await send('PAYMENT_VOIDED', 'payment', p.id, {}); }} /> : undefined} />
        ))}</Card>
      )}

      {order.note ? <Muted style={{ marginTop: 10 }}>Note: {order.note}</Muted> : null}
      <View style={{ gap: 10, marginTop: 16 }}>
        {actions.filter((a) => s.can(a.perm)).map((a) => <Button key={a.to} label={a.label} icon={a.icon} onPress={() => move(a.to)} loading={busy} />)}
        {canPay ? <Button label="Record payment" icon="cash" variant="ghost" onPress={() => { setAmount((balance / 100).toFixed(2)); setPaying(true); }} /> : null}
        {canCancel ? <Button label="Cancel order" variant="danger" onPress={async () => { if (await confirm('Cancel this order? The table becomes free.', { danger: true, okLabel: 'Cancel order' })) { if (await move('cancelled', 'Order cancelled')) router.back(); } }} /> : null}
      </View>

      <Sheet visible={paying} onClose={() => setPaying(false)} title="Record payment">
        <Field label={`Amount (due ${moneyMinor(balance)})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" ltr />
        <Chips items={[['cash', 'Cash'], ['card', 'Card'], ['online', 'Online'], ['other', 'Other']]} value={method} onChange={(v) => setMethod(v as Method)} />
        <Button label="Save payment" icon="checkmark" onPress={pay} loading={busy} />
      </Sheet>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add item" scroll>
        {d.products.map((p) => <ListItem key={p.id} title={p.name} sub={moneyMinor(p.price)} trail={<IconButton icon="add-circle" color="#3E6BFF" onPress={async () => { await send('ORDER_ITEM_ADDED', 'order_item', order.id, { orderId: order.id, itemId: uuid(), productId: p.id, name: p.name, qty: 1, unitPrice: p.price, note: '' }); }} />} />)}
        <Button label="Done" variant="ghost" onPress={() => setAdding(false)} />
      </Sheet>
    </Screen>
  );
}
