import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Chip, ChipRow, Divider, Field, IconButton, IconTile, ListCard, ListRow, Loading, Page, Pill, Row, SectionHeader, Sheet, Soft, StatusPill, Txt, color, tap, useLayout } from '../design';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { useLoad } from '../lib/hooks';
import { getPayments, listTables, orderSummary } from '../core/restaurant/store';
import { uuid } from '../core/util';
import { elapsed, moneyMinor, parseMinor } from '../lib/format';
import { ITEM_LABEL, ORDER_TYPE_LABEL } from '../lib/labels';
import { ORDER_ACCEPTS_ITEMS, type OrderStatus } from '../core/restaurant/order';
import type { Permission } from '../core/permissions';

type Method = 'cash' | 'card' | 'online' | 'other';
interface Act { label: string; icon: React.ComponentProps<typeof Button>['icon']; perm: Permission; to: OrderStatus }

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSession(); const { toast, confirm } = useApp(); const L = useLayout();
  const [paying, setPaying] = useState(false); const [amount, setAmount] = useState(''); const [method, setMethod] = useState<Method>('cash'); const [tendered, setTendered] = useState('');
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false);

  const [d, reload] = useLoad(async () => {
    const db = s.db!; const sum = await orderSummary(db, id); if (!sum) return null;
    return { sum, pays: await getPayments(db, id), table: (await listTables(db)).find((t) => t.id === sum.order.table_id)?.name ?? '',
      products: await db.getAllAsync<{ id: string; name: string; price: number }>('SELECT id, name, price FROM products WHERE deleted = 0 AND available = 1 ORDER BY name') };
  }, [s.rev, id]);
  if (!d) return <Page title="Order" back><Loading /></Page>;
  const { order, items, totals, paid, balance, payment } = d.sum; const st = order.status as OrderStatus;

  const send = async (type: any, et: any, eid: string, payload: Record<string, any>, ok?: string) => {
    setBusy(true); const r = await s.run(type, et, eid, payload); setBusy(false);
    if (!r.ok) toast(reasonText(r.reason), 'error'); else { tap('success'); if (ok) toast(ok, 'success'); }
    await reload(); return r.ok;
  };
  const move = (to: OrderStatus, ok?: string) => send('ORDER_STATUS_CHANGED', 'order', order.id, { from: st, to }, ok);

  const acts: Act[] = [];
  if (st === 'open') acts.push({ label: 'Send to kitchen', icon: 'flame', perm: 'orders.submit', to: 'sent_to_kitchen' });
  if (st === 'sent_to_kitchen') acts.push({ label: 'Start preparing', icon: 'restaurant', perm: 'kitchen.updateStatus', to: 'in_preparation' });
  if (st === 'in_preparation') acts.push({ label: 'Mark ready', icon: 'checkmark-done', perm: 'orders.markReady', to: 'ready' });
  if (st === 'ready') acts.push({ label: 'Mark served', icon: 'restaurant', perm: 'orders.markServed', to: 'served' });
  if (st === 'served' && payment === 'paid') acts.push({ label: 'Close order', icon: 'lock-closed', perm: 'orders.close', to: 'closed' });
  const primary = acts.find((a) => s.can(a.perm));
  const canCancel = ['open', 'sent_to_kitchen', 'in_preparation'].includes(st) && paid === 0 && s.can('orders.cancel');
  const canEdit = ORDER_ACCEPTS_ITEMS.includes(st) && s.can('orders.update');
  const canPay = st !== 'cancelled' && st !== 'closed' && balance > 0 && s.can('payments.record');
  const live = items.filter((i) => !i.voided);

  const given = parseMinor(tendered); const amt = parseMinor(amount);
  const change = method === 'cash' && given !== null && amt !== null && given > amt ? given - amt : 0;
  const pay = async () => {
    if (!amt) { toast('Enter a valid amount', 'error'); return; }
    if (await send('PAYMENT_RECORDED', 'payment', uuid(), { orderId: order.id, amount: amt, method }, change ? `Payment recorded. Change ${moneyMinor(change)}` : 'Payment recorded')) { setPaying(false); setTendered(''); }
  };
  const quick = [balance, Math.ceil(balance / 10000) * 10000, Math.ceil(balance / 50000) * 50000, Math.ceil(balance / 100000) * 100000].filter((v, i, a) => v >= balance && a.indexOf(v) === i).slice(0, 4);

  const itemsCard = (
    <>
      <SectionHeader title={`Items · ${live.reduce((a, i) => a + i.qty, 0)}`} action={canEdit ? 'Add item' : undefined} onAction={() => setAdding(true)} />
      <ListCard>
        {live.length === 0 ? <View style={{ padding: 16 }}><Soft>No items yet.</Soft></View> : live.map((i, k) => (
          <ListRow key={i.id} last={k === live.length - 1} title={`${i.qty} × ${i.name}`} sub={`${ITEM_LABEL[i.status]}${i.note ? ` · ${i.note}` : ''}`}
            trailing={<Row gap={4}><Txt v="bodyM" num>{moneyMinor(i.qty * i.unit_price)}</Txt>{canEdit || (s.can('items.void') && ORDER_ACCEPTS_ITEMS.includes(st)) ? <IconButton icon="trash-outline" tint={color.danger} size={36} onPress={async () => { if (await confirm(`Remove ${i.name}?`, { danger: true, okLabel: 'Remove' })) await send('ORDER_ITEM_REMOVED', 'order_item', i.id, { itemId: i.id }); }} /> : null}</Row>} />
        ))}
      </ListCard>
      {order.note ? <Banner tone="warning" icon="chatbox-ellipses" text={`Note: ${order.note}`} /> : null}
    </>
  );
  const bill = (
    <>
      <SectionHeader title="Bill" />
      <Card pad={16} style={{ gap: 8 }}>
        <Row justify="space-between"><Soft>Subtotal</Soft><Txt v="small" num>{moneyMinor(totals.subtotal)}</Txt></Row>
        {totals.discount > 0 ? <Row justify="space-between"><Soft>Discount</Soft><Txt v="small" num>-{moneyMinor(totals.discount)}</Txt></Row> : null}
        <Row justify="space-between"><Soft>Tax{order.tax_bps ? ` (${(order.tax_bps / 100).toFixed(order.tax_bps % 100 ? 2 : 0)}%)` : ''}</Soft><Txt v="small" num>{moneyMinor(totals.tax)}</Txt></Row>
        <Divider />
        <Row justify="space-between"><Txt v="h3">Total</Txt><Txt v="h2" num>{moneyMinor(totals.total)}</Txt></Row>
        <Row justify="space-between"><Soft>Paid</Soft><Txt v="smallM" num color={color.success}>{moneyMinor(paid)}</Txt></Row>
        <Row justify="space-between"><Soft>Balance due</Soft><Txt v="h3" num color={balance > 0 ? color.danger : color.success}>{moneyMinor(balance)}</Txt></Row>
      </Card>
      {d.pays.filter((p) => !p.voided).length > 0 ? (
        <ListCard style={{ marginTop: 10 }}>{d.pays.filter((p) => !p.voided).map((p, i, a) => (
          <ListRow key={p.id} last={i === a.length - 1} leading={<IconTile icon="cash" tone="success" size={38} />} title={moneyMinor(p.amount)} sub={p.method.toUpperCase()}
            trailing={s.can('payments.void') && st !== 'closed' ? <Button size="sm" variant="danger" label="Void" onPress={async () => { if (await confirm('Void this payment?', { danger: true, okLabel: 'Void' })) await send('PAYMENT_VOIDED', 'payment', p.id, {}); }} /> : undefined} />
        ))}</ListCard>
      ) : null}
    </>
  );

  const wide = L.width >= 840;
  return (
    <Page title={`Order #${order.number ?? '…'}`} subtitle={`${ORDER_TYPE_LABEL[order.order_type]}${d.table ? ` · ${d.table}` : ''} · ${elapsed(order.created_at)} ago`} back onRefresh={reload} right={<StatusPill status={st} />} bottomPad={120} wide>
      {wide ? <Row align="flex-start" gap={20}><View style={{ flex: 3 }}>{itemsCard}</View><View style={{ flex: 2 }}>{bill}</View></Row> : <>{itemsCard}{bill}</>}
      <View style={{ gap: 10, marginTop: 18 }}>
        {primary ? <Button label={primary.label} icon={primary.icon} size="lg" onPress={() => move(primary.to)} loading={busy} /> : null}
        {canPay ? <Button label="Take payment" icon="cash" size="lg" variant={primary ? 'outline' : 'primary'} onPress={() => { setAmount((balance / 100).toFixed(2)); setTendered(''); setPaying(true); }} /> : null}
        {canCancel ? <Button label="Cancel order" variant="danger" onPress={async () => { if (await confirm('Cancel this order? The table becomes free.', { danger: true, okLabel: 'Cancel order' })) { if (await move('cancelled', 'Order cancelled')) router.back(); } }} /> : null}
      </View>

      <Sheet visible={paying} onClose={() => setPaying(false)} title="Take payment" scroll>
        <ChipRow>{(['cash', 'card', 'online', 'other'] as Method[]).map((m) => <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={method === m} onPress={() => setMethod(m)} />)}</ChipRow>
        <Field label={`Amount (due ${moneyMinor(balance)})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="Rs" />
        {method === 'cash' ? <>
          <Txt v="smallM" color={color.soft}>Cash received</Txt>
          <ChipRow>{quick.map((v) => <Chip key={v} label={moneyMinor(v).replace('.00', '')} onPress={() => setTendered((v / 100).toFixed(2))} />)}</ChipRow>
          <Field value={tendered} onChangeText={setTendered} keyboardType="decimal-pad" prefix="Rs" placeholder="Amount given by customer" />
          {change > 0 ? <Banner tone="success" icon="swap-horizontal" text={`Give back ${moneyMinor(change)}`} /> : null}
        </> : null}
        <Button label="Record payment" icon="checkmark" size="lg" onPress={pay} loading={busy} />
      </Sheet>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add item" scroll>
        <ListCard>{d.products.map((p, i) => <ListRow key={p.id} last={i === d.products.length - 1} title={p.name} sub={moneyMinor(p.price)} trailing={<IconButton icon="add-circle" tint={color.primary} size={44} onPress={async () => { await send('ORDER_ITEM_ADDED', 'order_item', order.id, { orderId: order.id, itemId: uuid(), productId: p.id, name: p.name, qty: 1, unitPrice: p.price, note: '' }); }} />} />)}</ListCard>
        <Button label="Done" variant="tonal" onPress={() => setAdding(false)} />
      </Sheet>
    </Page>
  );
}
