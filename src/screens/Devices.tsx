// Parent only: pairing QR, pending approvals, approved devices (role change / remove).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Banner, Button, Card, Chip, ChipRow, EmptyState, Field, IconTile, ListCard, ListRow, Page, Pill, Row, SectionHeader, Sheet, Soft, Txt, color, statusMap, useLayout } from '../design';
import { reasonText, SERVICE_ID, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { useLoad } from '../lib/hooks';
import { encodeQr } from '../core/network/protocol';
import { BUILTIN_ROLES } from '../core/permissions';
import { customRoles } from '../core/restaurant/store';

interface DeviceRow { device_id: string; name: string; role_id: string | null; status: string }

export default function Devices() {
  const s = useSession(); const { toast, confirm } = useApp(); const L = useLayout();
  const [qr, setQr] = useState('');
  const [approving, setApproving] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState(''); const [role, setRole] = useState('role-waiter');
  const [editing, setEditing] = useState<DeviceRow | null>(null);

  const [data, reload] = useLoad(async () => {
    const db = s.db!;
    return { devices: await db.getAllAsync<DeviceRow>(`SELECT device_id, name, role_id, status FROM devices WHERE status IN ('pending','approved') ORDER BY joined_at`), roles: await customRoles(db) };
  }, [s.rev]);
  useEffect(() => { void reload(); }, [s.rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = [...Object.values(BUILTIN_ROLES).filter((r) => r.id !== 'role-admin').map((r) => ({ value: r.id, label: r.name })), ...Object.keys(data?.roles ?? {}).map((id) => ({ value: id, label: id }))];
  const showQr = () => { const p = s.parent; if (p) setQr(encodeQr(p.openPairing(SERVICE_ID, p.endpointName))); };
  useEffect(() => { showQr(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps  (pairing is only valid while a QR is open)
  const act = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast(ok, 'success'); setApproving(null); setEditing(null); await reload(); } catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); }
  };
  const pending = data?.devices.filter((d) => d.status === 'pending') ?? [];
  const approved = data?.devices.filter((d) => d.status === 'approved' && d.device_id !== s.deviceId) ?? [];
  const online = new Set(s.parent?.connectedDeviceIds() ?? []);
  const roleName = (id: string | null) => BUILTIN_ROLES[id ?? '']?.name ?? id ?? '';
  const qrSize = Math.min(260, L.width - L.gutter * 2 - 64);

  const rolePicker = (
    <View style={{ gap: 6 }}><Txt v="smallM" color={color.soft}>Role</Txt><ChipRow>{roleOptions.map((o) => <Chip key={o.value} label={o.label} selected={role === o.value} onPress={() => setRole(o.value)} />)}</ChipRow></View>
  );
  return (
    <Page title="Devices" subtitle="Network" back onRefresh={reload}>
      <Card pad={20} style={{ alignItems: 'center', gap: 12 }}>
        {qr ? <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: color.line }}><QRCode value={qr} size={qrSize} /></View>
          : <><IconTile icon="qr-code" size={64} /><Txt v="h3" center>Add a device</Txt><Soft center>Show the pairing code, then scan it from the new device. You approve it before it can join.</Soft></>}
        {qr ? <Soft center>Valid for 10 minutes · Keep this screen open while the device scans.</Soft> : null}
        <Button label={qr ? 'New QR code' : 'Show pairing QR'} icon="qr-code" onPress={showQr} />
      </Card>

      {s.netError
        ? <Banner tone="danger" icon="bluetooth" text={`Network is not running: ${reasonText(s.netError)}`} action="Restart" onAction={() => { void s.retryNetwork(); }} />
        : <Banner tone="success" icon="radio" text={`Listening for devices as ${s.parent?.endpointName ?? ''}. Keep Bluetooth, Wi-Fi and Location on.`} action="Restart" onAction={() => { void s.retryNetwork(); }} />}

      <SectionHeader title={`Waiting for approval · ${pending.length}`} />
      {pending.length === 0 ? <Soft>No devices are waiting.</Soft> : (
        <ListCard>{pending.map((d, i) => (
          <ListRow key={d.device_id} last={i === pending.length - 1} leading={<IconTile icon="phone-portrait" tone="warning" size={42} />} title={d.name} sub="Wants to join"
            trailing={<Row gap={6}><Button size="sm" label="Approve" onPress={() => { setApproving({ id: d.device_id, name: d.name }); setName(d.name); }} /><Button size="sm" variant="danger" label="Decline" onPress={() => act(() => s.parent!.reject(d.device_id), 'Declined')} /></Row>} />
        ))}</ListCard>
      )}

      <SectionHeader title={`Approved devices · ${approved.length}`} />
      {approved.length === 0 ? <Card><EmptyState icon="phone-portrait-outline" title="No child devices yet" text="Pair waiter, kitchen and cashier devices to share orders in real time." /></Card> : (
        <ListCard>{approved.map((d, i) => (
          <ListRow key={d.device_id} last={i === approved.length - 1} leading={<IconTile icon="phone-portrait" tone="success" size={42} />} title={d.name} sub={roleName(d.role_id)} chevron
            trailing={<Pill label={online.has(d.device_id) ? 'Online' : 'Offline'} fg={statusMap[online.has(d.device_id) ? 'online' : 'offline'].fg} bg={statusMap[online.has(d.device_id) ? 'online' : 'offline'].bg} />}
            onPress={() => { setEditing(d); setRole(d.role_id ?? 'role-waiter'); setName(d.name); }} />
        ))}</ListCard>
      )}

      <Sheet visible={!!approving} onClose={() => setApproving(null)} title="Approve device" scroll>
        <Field label="Device name" value={name} onChangeText={setName} />{rolePicker}
        <Button label="Approve device" icon="checkmark" size="lg" onPress={() => act(() => s.parent!.approve(approving!.id, name.trim() || approving!.name, role), 'Device approved')} />
      </Sheet>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.name} scroll>
        <Field label="Device name" value={name} onChangeText={setName} />{rolePicker}
        <Button label="Save changes" size="lg" onPress={() => act(() => s.parent!.setRole(editing!.device_id, role, name.trim()), 'Saved')} />
        <Button label="Remove device" variant="danger" onPress={async () => { if (await confirm('This device will be disconnected and can no longer use the network.', { danger: true, okLabel: 'Remove' })) await act(() => s.parent!.revoke(editing!.device_id), 'Device removed'); }} />
      </Sheet>
    </Page>
  );
}
