import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Card, EmptyState, Grid, IconTile, KpiTile, ListCard, ListRow, Page, Row, SectionHeader, Soft, StatusPill, Txt, color } from '../design';
import { SyncChip } from '../shell/SyncChip';
import { reasonText, useSession } from '../runtime/session';
import { useLoad } from '../lib/hooks';
import { listOrders, listTables, orderSummary } from '../core/restaurant/store';
import { elapsed, moneyMinor, startOfDay } from '../lib/format';

function greeting(): string { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export default function Home() {
  const s = useSession();
  const [d, reload] = useLoad(async () => {
    const db = s.db!; const t0 = startOfDay();
    const sales = (await db.getFirstAsync<{ v: number | null }>('SELECT SUM(amount) AS v FROM payments WHERE voided = 0 AND created_at >= ?', [t0]))?.v ?? 0;
    const todayOrders = (await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM orders WHERE rejected = 0 AND status != 'cancelled' AND created_at >= ?`, [t0]))?.c ?? 0;
    const active = await listOrders(db, ['open', 'sent_to_kitchen', 'in_preparation', 'ready', 'served']);
    const sums = (await Promise.all(active.slice(0, 6).map((o) => orderSummary(db, o.id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof orderSummary>>>[];
    const tables = await listTables(db);
    return { sales, todayOrders, active: active.length, sums, tables, busy: tables.filter((t) => t.occupied).length };
  }, [s.rev]);

  const tiles = [
    s.can('reports.view') || s.can('billing.view') ? <KpiTile key="s" icon="cash" tone="success" label="Today's sales" value={moneyMinor(d?.sales ?? 0)} /> : null,
    <KpiTile key="o" icon="receipt" tone="info" label="Orders today" value={String(d?.todayOrders ?? 0)} sub={d && d.todayOrders ? `Avg ${moneyMinor(Math.round((d.sales || 0) / d.todayOrders))}` : undefined} />,
    <KpiTile key="a" icon="flame" tone="warning" label="Active orders" value={String(d?.active ?? 0)} onPress={() => router.push('/orders')} />,
    <KpiTile key="t" icon="restaurant" tone="violet" label="Tables in use" value={d ? `${d.busy}/${d.tables.length}` : '–'} onPress={() => router.push('/tables')} />,
  ].filter(Boolean);

  const quick = [
    s.can('orders.create') && { icon: 'add-circle' as const, label: 'New order', on: () => router.push('/new-order') },
    s.can('kitchen.view') && { icon: 'flame' as const, label: 'Kitchen', on: () => router.push('/kitchen') },
    s.can('menu.manage') && { icon: 'fast-food' as const, label: 'Menu & tables', on: () => router.push('/menu') },
    s.can('devices.manage') && { icon: 'people' as const, label: 'Devices', on: () => router.push('/devices') },
  ].filter(Boolean) as { icon: 'add-circle'; label: string; on: () => void }[];

  const empty = s.mode === 'parent' && d && d.tables.length === 0;
  return (
    <Page title={s.restaurantName || 'Restaurant POS'} subtitle={`${greeting()} · ${s.roleName}`} right={<SyncChip />} onRefresh={reload} large>
      {s.mode === 'parent' && s.pendingCount > 0 ? <Banner tone="warning" icon="person-add" text={`${s.pendingCount} device${s.pendingCount > 1 ? 's' : ''} waiting for approval`} action="Review" onAction={() => router.push('/devices')} /> : null}
      {s.netError ? <Banner tone="danger" icon="bluetooth" text={`Network problem: ${reasonText(s.netError)}`} action="Retry" onAction={() => { void s.retryNetwork(); }} /> : null}
      {empty ? <Banner tone="info" icon="sparkles" text="Welcome! Start by adding your menu and tables, then pair your waiter and kitchen devices." action="Set up" onAction={() => router.push('/menu')} /> : null}
      <Grid min={150} style={{ marginTop: 8 }}>{tiles}</Grid>

      {quick.length > 0 && <>
        <SectionHeader title="Quick actions" />
        <Grid min={150}>{quick.map((q) => (
          <Card key={q.label} onPress={q.on} pad={14}><Row><IconTile icon={q.icon} size={40} /><Txt v="bodyM" style={{ flex: 1 }} lines={1}>{q.label}</Txt></Row></Card>
        ))}</Grid>
      </>}

      <SectionHeader title="Active orders" action={d?.active ? 'See all' : undefined} onAction={() => router.push('/orders')} />
      {!d || d.sums.length === 0 ? <Card><EmptyState icon="receipt-outline" title="No active orders" text="New orders show up here on every device as soon as they are placed." action={s.can('orders.create') ? 'New order' : undefined} onAction={() => router.push('/new-order')} /></Card> : (
        <ListCard>{d.sums.map((x, i) => (
          <ListRow key={x.order.id} last={i === d.sums.length - 1} onPress={() => router.push({ pathname: '/order/[id]', params: { id: x.order.id } })} chevron
            leading={<IconTile icon={x.order.table_id ? 'restaurant' : 'bag-handle'} size={42} />}
            title={`Order #${x.order.number ?? '…'} · ${moneyMinor(x.totals.total)}`} sub={`${x.order.table_id ? (d.tables.find((t) => t.id === x.order.table_id)?.name ?? 'Table') : x.order.order_type === 'delivery' ? 'Delivery' : 'Takeaway'} · ${elapsed(x.order.created_at)} ago`}
            trailing={<StatusPill status={x.order.status} />} />
        ))}</ListCard>
      )}
      <View style={{ height: 8 }} /><Soft center style={{ marginTop: 16 }}>{s.mode === 'child' && !s.perms.size ? 'No permissions are assigned to this role yet.' : ''}</Soft>
    </Page>
  );
}
