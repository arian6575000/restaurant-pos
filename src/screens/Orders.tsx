import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, ChipRow, EmptyState, Grid, IconButton, IconTile, Page, Row, Soft, StatusPill, Txt, color } from '../design';
import { SyncChip } from '../shell/SyncChip';
import { useSession } from '../runtime/session';
import { useLoad } from '../lib/hooks';
import { listOrders, listTables, orderSummary } from '../core/restaurant/store';
import { elapsed, moneyMinor } from '../lib/format';
import { ORDER_TYPE_LABEL } from '../lib/labels';
import type { OrderStatus } from '../core/restaurant/order';

type F = 'active' | 'ready' | 'served' | 'closed' | 'cancelled' | 'all';
const FILTERS: { k: F; label: string; st?: OrderStatus[] }[] = [
  { k: 'active', label: 'Active', st: ['open', 'sent_to_kitchen', 'in_preparation'] },
  { k: 'ready', label: 'Ready', st: ['ready'] },
  { k: 'served', label: 'To bill', st: ['served'] },
  { k: 'closed', label: 'Closed', st: ['closed'] },
  { k: 'cancelled', label: 'Cancelled', st: ['cancelled'] },
  { k: 'all', label: 'All' },
];

export default function Orders() {
  const s = useSession(); const [f, setF] = useState<F>('active');
  const [d, reload] = useLoad(async () => {
    const db = s.db!; const all = await listOrders(db); const tables = await listTables(db);
    const sums = (await Promise.all(all.slice(0, 120).map((o) => orderSummary(db, o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof orderSummary>>>[];
    return { sums, tables };
  }, [s.rev]);
  const def = FILTERS.find((x) => x.k === f)!;
  const rows = (d?.sums ?? []).filter((x) => !def.st || def.st.includes(x.order.status));
  const count = (k: F) => { const fd = FILTERS.find((x) => x.k === k)!; return (d?.sums ?? []).filter((x) => !fd.st || fd.st.includes(x.order.status)).length; };

  return (
    <Page title="Orders" subtitle="Live" right={<Row gap={8}><SyncChip />{s.can('orders.create') ? <IconButton icon="add" bg={color.primary} tint="#fff" onPress={() => router.push('/new-order')} label="New order" /> : null}</Row>} onRefresh={reload} wide>
      <ChipRow>{FILTERS.map((x) => <Chip key={x.k} label={x.label} selected={f === x.k} count={x.k === 'all' ? undefined : count(x.k)} onPress={() => setF(x.k)} />)}</ChipRow>
      <Row style={{ height: 14 }}><View /></Row>
      {rows.length === 0 ? <Card><EmptyState icon="receipt-outline" title="No orders here" text="Orders in this state will appear automatically." action={s.can('orders.create') ? 'New order' : undefined} onAction={() => router.push('/new-order')} /></Card> : (
        <Grid min={320}>
          {rows.map((x) => {
            const table = d?.tables.find((t) => t.id === x.order.table_id)?.name;
            const n = x.items.filter((i) => !i.voided).reduce((a, i) => a + i.qty, 0);
            return (
              <Card key={x.order.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: x.order.id } })} pad={14} style={{ gap: 10 }}>
                <Row justify="space-between"><Row gap={10}><IconTile icon={x.order.table_id ? 'restaurant' : x.order.order_type === 'delivery' ? 'bicycle' : 'bag-handle'} size={42} /><View><Txt v="h3">#{x.order.number ?? '…'}</Txt><Soft>{table ?? ORDER_TYPE_LABEL[x.order.order_type]}</Soft></View></Row><StatusPill status={x.order.status} /></Row>
                <Soft lines={2}>{x.items.filter((i) => !i.voided).slice(0, 3).map((i) => `${i.qty}× ${i.name}`).join(' · ') || 'No items yet'}</Soft>
                <Row justify="space-between"><Soft>{n} item{n === 1 ? '' : 's'} · {elapsed(x.order.created_at)} ago</Soft><Txt v="h3" num color={color.primaryDark}>{moneyMinor(x.totals.total)}</Txt></Row>
              </Card>
            );
          })}
        </Grid>
      )}
    </Page>
  );
}
