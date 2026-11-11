import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Credit, Empty, Grid, ListItem, Muted, Row, Screen, SectionLabel, StatCard, T, IconButton } from '../kit';
import { useSession } from '../../runtime/session';
import { useLoad } from '../../lib/hooks';
import { listOrders, listTables, orderSummary } from '../../core/restaurant/store';
import { moneyMinor } from '../../lib/format';
import { ORDER_LABEL } from '../../lib/labels';

export default function Home() {
  const s = useSession();
  const [data, reload] = useLoad(async () => {
    if (!s.db) return null;
    const orders = s.can('orders.view') ? await listOrders(s.db, ['open', 'sent_to_kitchen', 'in_preparation', 'ready', 'served']) : [];
    const sums = await Promise.all(orders.map((o) => orderSummary(s.db!, o.id)));
    const tables = s.can('tables.view') ? await listTables(s.db) : [];
    return { sums: sums.filter(Boolean) as NonNullable<(typeof sums)[number]>[], tables };
  }, [s.rev, s.perms]);

  const online = s.mode === 'parent' ? (s.parent?.connectedDeviceIds().length ?? 0) : null;
  const status = s.mode === 'parent' ? `${online} device${online === 1 ? '' : 's'} online` : s.childStatus?.connected ? 'Connected to Parent' : 'Offline – changes will sync later';
  const pending = s.childStatus?.pendingEvents ?? 0;

  return (
    <Screen title={s.restaurantName || 'Restaurant POS'} subtitle={s.roleName} onRefresh={reload}
      right={<IconButton icon="settings-outline" onPress={() => router.push('/settings')} />}>
      <Card style={{ marginBottom: 14 }}>
        <Row><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.mode === 'parent' || s.childStatus?.connected ? '#14C48B' : '#FF9F43' }} /><T size={13} bold>{status}</T></Row>
        {pending > 0 ? <Muted>{pending} change(s) waiting to sync</Muted> : null}
      </Card>

      <Grid>
        {s.can('orders.create') && <StatCard icon="add-circle" tone="blue" value="New" label="New order" onPress={() => router.push('/new-order')} small />}
        {s.can('kitchen.view') && <StatCard icon="flame" tone="orange" value="Kitchen" label="Kitchen queue" onPress={() => router.push('/kitchen')} small />}
        {s.can('menu.manage') && <StatCard icon="fast-food" tone="green" value="Menu" label="Menu & tables" onPress={() => router.push('/menu')} small />}
        {s.can('devices.manage') && <StatCard icon="people" tone="violet" value="Devices" label="Devices & roles" onPress={() => router.push('/devices')} small />}
      </Grid>

      {s.can('tables.view') && (data?.tables.length ?? 0) > 0 && (
        <>
          <SectionLabel>Tables</SectionLabel>
          <Row wrap gap={8} style={{ marginBottom: 14 }}>
            {data!.tables.map((t) => (
              <Card key={t.id} style={{ width: '31%', alignItems: 'center', paddingVertical: 12 }}
                onPress={() => t.orderId ? router.push({ pathname: '/order/[id]', params: { id: t.orderId } }) : s.can('orders.create') ? router.push({ pathname: '/new-order', params: { tableId: t.id } }) : undefined}>
                <T bold>{t.name}</T><T size={11.5} color={t.occupied ? '#FF4757' : '#14C48B'} bold>{t.occupied ? 'Occupied' : 'Free'}</T>
              </Card>
            ))}
          </Row>
        </>
      )}

      {s.can('orders.view') && (
        <>
          <SectionLabel>Active orders</SectionLabel>
          {!data || data.sums.length === 0 ? <Empty icon="receipt-outline" title="No active orders" text="New orders appear here on every device." /> : (
            <Card flush>
              {data.sums.map((x, i) => (
                <ListItem key={x.order.id} last={i === data.sums.length - 1} onPress={() => router.push({ pathname: '/order/[id]', params: { id: x.order.id } })}
                  title={`Order #${x.order.number ?? '…'}`} sub={x.order.table_id ? `Table · ${data.tables.find((t) => t.id === x.order.table_id)?.name ?? ''}` : x.order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}
                  trail={<View style={{ alignItems: 'flex-end', gap: 4 }}><T bold>{moneyMinor(x.totals.total)}</T><Badge status={x.order.status} label={ORDER_LABEL[x.order.status]} /></View>} />
              ))}
            </Card>
          )}
        </>
      )}
      {s.mode === 'child' && !s.perms.size ? <Muted>No permissions assigned to this role yet.</Muted> : null}
      <Button label="Refresh" icon="refresh" variant="ghost" small onPress={reload} style={{ marginTop: 12, alignSelf: 'center' }} />
      <Credit />
    </Screen>
  );
}
