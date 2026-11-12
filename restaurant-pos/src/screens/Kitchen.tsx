// Kitchen board: New / Preparing / Ready columns with live timers. One column at a time on phones, side by side on larger windows.
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, Page, Pill, Row, Segmented, Soft, Txt, color, radius, tap, useLayout } from '../design';
import { SyncChip } from '../shell/SyncChip';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { useLoad } from '../lib/hooks';
import { listOrders, listTables, orderSummary } from '../core/restaurant/store';
import { elapsed } from '../lib/format';

type Col = 'sent_to_kitchen' | 'in_preparation' | 'ready';
const COLS: { k: Col; label: string; next?: { to: string; label: string; perm: 'kitchen.updateStatus' | 'orders.markReady' } }[] = [
  { k: 'sent_to_kitchen', label: 'New', next: { to: 'in_preparation', label: 'Start preparing', perm: 'kitchen.updateStatus' } },
  { k: 'in_preparation', label: 'Preparing', next: { to: 'ready', label: 'Mark ready', perm: 'orders.markReady' } },
  { k: 'ready', label: 'Ready' },
];

export default function Kitchen() {
  const s = useSession(); const L = useLayout(); const { toast } = useApp();
  const [col, setCol] = useState<Col>('sent_to_kitchen'); const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(id); }, []);
  const [d, reload] = useLoad(async () => {
    const db = s.db!; const os = await listOrders(db, ['sent_to_kitchen', 'in_preparation', 'ready']); const tables = await listTables(db);
    const sums = (await Promise.all(os.reverse().map((o) => orderSummary(db, o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof orderSummary>>>[];
    return { sums, tables };
  }, [s.rev]);

  const move = async (id: string, from: string, to: string) => {
    const r = await s.run('ORDER_STATUS_CHANGED', 'order', id, { from, to });
    if (!r.ok) toast(reasonText(r.reason), 'error'); else tap('success');
    await reload();
  };
  const column = (c: (typeof COLS)[number]) => {
    const list = (d?.sums ?? []).filter((x) => x.order.status === c.k);
    return list.length === 0 ? <Card><EmptyState icon="checkmark-done-outline" title={c.k === 'sent_to_kitchen' ? 'No new orders' : 'Nothing here'} text="Tickets appear here automatically." /></Card> : (
      <View style={{ gap: 12 }}>{list.map((x) => {
        const mins = Math.floor((now - x.order.created_at) / 60000);
        const late = mins >= 20 ? color.danger : mins >= 10 ? color.warning : color.success;
        const table = d?.tables.find((t) => t.id === x.order.table_id)?.name;
        return (
          <Card key={x.order.id} pad={14} style={{ gap: 10, borderLeftWidth: 5, borderLeftColor: late }} onPress={() => router.push({ pathname: '/order/[id]', params: { id: x.order.id } })}>
            <Row justify="space-between"><Txt v="h2">#{x.order.number ?? '…'}</Txt><Pill icon="time-outline" label={elapsed(x.order.created_at, now)} fg={late} bg={mins >= 20 ? color.dangerTint : mins >= 10 ? color.warningTint : color.successTint} /></Row>
            <Soft>{table ?? (x.order.order_type === 'delivery' ? 'Delivery' : 'Takeaway')}</Soft>
            <View style={{ gap: 6 }}>{x.items.filter((i) => !i.voided).map((i) => (
              <Row key={i.id} align="flex-start" gap={10}>
                <View style={{ minWidth: 30, height: 28, borderRadius: radius.sm, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}><Txt v="smallM" color={color.primaryDark} num>{i.qty}×</Txt></View>
                <View style={{ flex: 1 }}><Txt v="bodyM">{i.name}</Txt>{i.note ? <Txt v="small" color={color.warning}>{i.note}</Txt> : null}</View>
              </Row>
            ))}</View>
            {x.order.note ? <Txt v="small" color={color.warning}>Note: {x.order.note}</Txt> : null}
            {c.next && s.can(c.next.perm) ? <Button label={c.next.label} icon={c.next.to === 'ready' ? 'checkmark-done' : 'flame'} size="lg" onPress={() => move(x.order.id, c.k, c.next!.to)} /> : null}
          </Card>
        );
      })}</View>
    );
  };
  const counts = (k: Col) => (d?.sums ?? []).filter((x) => x.order.status === k).length;
  const multi = L.cls !== 'compact';

  return (
    <Page title="Kitchen" subtitle="Tickets" right={<SyncChip />} onRefresh={reload} fill>
      {multi ? (
        <ScrollView horizontal={L.width < 900} contentContainerStyle={{ padding: L.gutter, paddingTop: 4, gap: 14, flexGrow: 1 }} style={{ flex: 1 }}>
          {COLS.map((c) => (
            <View key={c.k} style={{ flex: L.width < 900 ? undefined : 1, width: L.width < 900 ? 320 : undefined }}>
              <Row style={{ marginBottom: 10 }}><Txt v="h3">{c.label}</Txt><Pill label={String(counts(c.k))} fg={color.primaryDark} bg={color.primaryTint} /></Row>
              <ScrollView showsVerticalScrollIndicator={false}>{column(c)}</ScrollView>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: L.gutter, paddingTop: 4, gap: 14 }}>
          <Segmented items={COLS.map((c) => [c.k, `${c.label} ${counts(c.k)}`] as [Col, string])} value={col} onChange={setCol} />
          {column(COLS.find((c) => c.k === col)!)}
        </ScrollView>
      )}
    </Page>
  );
}
