import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, ChipRow, EmptyState, Grid, Page, Row, Soft, StatusPill, Txt, color, statusMap, radius } from '../design';
import { Ionicons } from '@expo/vector-icons';
import { SyncChip } from '../shell/SyncChip';
import { useSession } from '../runtime/session';
import { useLoad } from '../lib/hooks';
import { listTables, orderSummary } from '../core/restaurant/store';
import { elapsed, moneyMinor } from '../lib/format';

type Filter = 'all' | 'free' | 'busy';

export default function Tables() {
  const s = useSession(); const [f, setF] = useState<Filter>('all');
  const [d, reload] = useLoad(async () => {
    const db = s.db!; const tables = await listTables(db);
    const sums = await Promise.all(tables.map((t) => (t.orderId ? orderSummary(db, t.orderId) : Promise.resolve(null))));
    return tables.map((t, i) => ({ t, o: sums[i] }));
  }, [s.rev]);
  const rows = (d ?? []).filter((x) => f === 'all' || (f === 'free' ? !x.t.occupied : x.t.occupied));
  const busy = (d ?? []).filter((x) => x.t.occupied).length;

  return (
    <Page title="Tables" subtitle="Floor" right={<SyncChip />} onRefresh={reload}>
      <ChipRow>
        <Chip label="All" selected={f === 'all'} count={d?.length ?? 0} onPress={() => setF('all')} />
        <Chip label="Free" selected={f === 'free'} count={(d?.length ?? 0) - busy} onPress={() => setF('free')} tint={color.success} />
        <Chip label="Occupied" selected={f === 'busy'} count={busy} onPress={() => setF('busy')} />
      </ChipRow>
      <View style={{ height: 14 }} />
      {rows.length === 0 ? <Card><EmptyState icon="restaurant-outline" title={d?.length ? 'Nothing here' : 'No tables yet'} text={d?.length ? 'No tables match this filter.' : s.can('tables.manage') ? 'Add your tables in Menu & tables.' : 'The Parent has not added any tables yet.'} action={!d?.length && s.can('tables.manage') ? 'Add tables' : undefined} onAction={() => router.push('/menu')} /></Card> : (
        <Grid min={150}>
          {rows.map(({ t, o }) => {
            const st = o ? statusMap[o.order.status] : null;
            return (
              <Card key={t.id} pad={14} style={{ minHeight: 132, borderColor: st ? st.fg : color.line, borderWidth: st ? 1.5 : 1, backgroundColor: st ? st.bg : color.surface }}
                onPress={() => o ? router.push({ pathname: '/order/[id]', params: { id: o.order.id } }) : s.can('orders.create') ? router.push({ pathname: '/new-order', params: { tableId: t.id } }) : undefined}>
                <Row justify="space-between" align="flex-start">
                  <Txt v="h2" lines={1} style={{ flex: 1 }}>{t.name}</Txt>
                  <Row gap={3}><Ionicons name="people-outline" size={14} color={color.faint} /><Soft>{t.capacity}</Soft></Row>
                </Row>
                <View style={{ flex: 1 }} />
                {o ? (
                  <View style={{ gap: 4 }}>
                    <StatusPill status={o.order.status} />
                    <Row justify="space-between"><Txt v="bodyM" num>{moneyMinor(o.totals.total)}</Txt><Soft>{elapsed(o.order.created_at)}</Soft></Row>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: color.success }} /><Txt v="smallM" color={color.success}>Free</Txt>
                    {s.can('orders.create') ? <Txt v="small" color={color.faint}> · tap to order</Txt> : null}
                  </View>
                )}
              </Card>
            );
          })}
        </Grid>
      )}
    </Page>
  );
}
