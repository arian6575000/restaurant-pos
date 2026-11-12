import React from 'react';
import { router } from 'expo-router';
import { Card, IconTile, ListCard, ListRow, Page, Row, SectionHeader, Soft, Txt, color } from '../design';
import { SyncChip } from '../shell/SyncChip';
import { useSession } from '../runtime/session';
import { CREDIT } from '../lib/brand';

export default function More() {
  const s = useSession();
  const items = [
    s.can('menu.manage') && { icon: 'fast-food' as const, title: 'Menu & tables', sub: 'Dishes, categories, prices, tables', to: '/menu' },
    s.can('devices.manage') && { icon: 'people' as const, title: 'Devices & roles', sub: s.pendingCount > 0 ? `${s.pendingCount} waiting for approval` : 'Pair devices, approve, change roles', to: '/devices' },
    { icon: 'settings' as const, title: 'Settings', sub: 'Security, device, erase data', to: '/settings' },
  ].filter(Boolean) as { icon: 'settings'; title: string; sub: string; to: '/settings' }[];
  return (
    <Page title="More" subtitle={s.restaurantName || 'Restaurant POS'} right={<SyncChip />}>
      <Card tone="primary" pad={16}><Row gap={12}><IconTile icon="person-circle" size={48} /><Soft style={{ flex: 1 }}><Txt v="h3">{s.roleName || 'Device'}</Txt>{'\n'}{s.mode === 'parent' ? 'Parent device' : 'Child device'} · ID {s.deviceId.slice(0, 8)}</Soft></Row></Card>
      <SectionHeader title="Manage" />
      <ListCard>{items.map((it, i) => <ListRow key={it.title} last={i === items.length - 1} leading={<IconTile icon={it.icon} size={42} />} title={it.title} sub={it.sub} chevron onPress={() => router.push(it.to)} />)}</ListCard>
      <Soft center style={{ marginTop: 28 }}>{CREDIT}</Soft>
    </Page>
  );
}
