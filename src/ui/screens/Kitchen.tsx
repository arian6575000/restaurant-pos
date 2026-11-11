import React from 'react';
import { router } from 'expo-router';
import { Badge, Button, Card, Empty, Muted, Row, Screen, T } from '../kit';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { useLoad } from '../../lib/hooks';
import { listOrders, orderSummary } from '../../core/restaurant/store';
import { ORDER_LABEL } from '../../lib/labels';

export default function Kitchen() {
  const s = useSession(); const { toast } = useApp();
  const [rows, reload] = useLoad(async () => {
    const db = s.db!; const os = await listOrders(db, ['sent_to_kitchen', 'in_preparation']);
    return (await Promise.all(os.reverse().map((o) => orderSummary(db, o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof orderSummary>>>[];
  }, [s.rev]);
  const move = async (id: string, from: string, to: string) => {
    const r = await s.run('ORDER_STATUS_CHANGED', 'order', id, { from, to });
    if (!r.ok) toast(reasonText(r.reason), 'error'); await reload();
  };
  return (
    <Screen title="Kitchen" subtitle="Queue" back onRefresh={reload}>
      {!rows || rows.length === 0 ? <Empty icon="flame-outline" title="Nothing to cook" text="Orders sent by waiters appear here." /> : rows.map((x) => (
        <Card key={x.order.id} style={{ marginBottom: 12 }} onPress={() => router.push({ pathname: '/order/[id]', params: { id: x.order.id } })}>
          <Row><T bold size={17} style={{ flex: 1 }}>Order #{x.order.number ?? '…'}</T><Badge status={x.order.status} label={ORDER_LABEL[x.order.status]} /></Row>
          {x.items.filter((i) => !i.voided).map((i) => <T key={i.id} size={15}>{i.qty} × {i.name}{i.note ? ` — ${i.note}` : ''}</T>)}
          {x.order.note ? <Muted>Note: {x.order.note}</Muted> : null}
          <Row style={{ marginTop: 8 }}>
            {x.order.status === 'sent_to_kitchen' && s.can('kitchen.updateStatus') ? <Button block icon="restaurant" label="Start preparing" onPress={() => move(x.order.id, 'sent_to_kitchen', 'in_preparation')} /> : null}
            {x.order.status === 'in_preparation' && s.can('orders.markReady') ? <Button block icon="checkmark-done" label="Mark ready" onPress={() => move(x.order.id, 'in_preparation', 'ready')} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
