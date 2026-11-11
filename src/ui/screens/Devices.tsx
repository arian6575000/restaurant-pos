// Parent only: pairing QR, pending approvals, approved devices (role change / remove).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, Field, ListItem, Muted, Row, Screen, SectionLabel, SelectField, Sheet, T, Badge, Empty } from '../kit';
import { reasonText, SERVICE_ID, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { useLoad } from '../../lib/hooks';
import { encodeQr } from '../../core/network/protocol';
import { BUILTIN_ROLES } from '../../core/permissions';
import { customRoles } from '../../core/restaurant/store';

interface DeviceRow { device_id: string; name: string; role_id: string | null; status: string }

export default function Devices() {
  const s = useSession(); const { toast, confirm } = useApp();
  const [qr, setQr] = useState('');
  const [approving, setApproving] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState(''); const [role, setRole] = useState('role-waiter');
  const [editing, setEditing] = useState<DeviceRow | null>(null);

  const [data, reload] = useLoad(async () => {
    const db = s.db!;
    const devices = await db.getAllAsync<DeviceRow>(`SELECT device_id, name, role_id, status FROM devices WHERE status IN ('pending','approved') ORDER BY joined_at`);
    return { devices, roles: await customRoles(db) };
  }, [s.rev]);
  useEffect(() => { void reload(); }, [s.rev]);   // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = [
    ...Object.values(BUILTIN_ROLES).filter((r) => r.id !== 'role-admin').map((r) => ({ value: r.id, label: r.name })),
    ...Object.keys(data?.roles ?? {}).map((id) => ({ value: id, label: id })),
  ];
  const showQr = () => {
    const p = s.parent; if (!p) return;
    setQr(encodeQr(p.openPairing(SERVICE_ID, p.endpointName)));
  };
  const act = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast(ok, 'success'); setApproving(null); setEditing(null); await reload(); } catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); }
  };
  const pending = data?.devices.filter((d) => d.status === 'pending') ?? [];
  const approved = data?.devices.filter((d) => d.status === 'approved' && d.device_id !== s.deviceId) ?? [];
  const online = new Set(s.parent?.connectedDeviceIds() ?? []);

  return (
    <Screen title="Devices" subtitle="Network" back onRefresh={reload}>
      <Card style={{ alignItems: 'center', gap: 10 }}>
        {qr ? <View style={{ padding: 10, backgroundColor: '#fff', borderRadius: 12 }}><QRCode value={qr} size={220} /></View> : <Muted>Show the QR code, then scan it from the new device.</Muted>}
        <Muted>The code is valid for 10 minutes. Devices still need your approval.</Muted>
        <Button label={qr ? 'New QR code' : 'Show pairing QR'} icon="qr-code" onPress={showQr} />
      </Card>

      <SectionLabel>Waiting for approval</SectionLabel>
      {pending.length === 0 ? <Muted>No devices are waiting.</Muted> : (
        <Card flush>{pending.map((d, i) => (
          <ListItem key={d.device_id} last={i === pending.length - 1} title={d.name} sub="Wants to join"
            trail={<Row gap={6}><Button small label="Approve" onPress={() => { setApproving({ id: d.device_id, name: d.name }); setName(d.name); }} /><Button small variant="danger" label="Decline" onPress={() => act(() => s.parent!.reject(d.device_id), 'Declined')} /></Row>} />
        ))}</Card>
      )}

      <SectionLabel>Approved devices</SectionLabel>
      {approved.length === 0 ? <Empty icon="phone-portrait-outline" title="No child devices yet" /> : (
        <Card flush>{approved.map((d, i) => (
          <ListItem key={d.device_id} last={i === approved.length - 1} title={d.name} sub={BUILTIN_ROLES[d.role_id ?? '']?.name ?? d.role_id ?? ''}
            trail={<Row gap={8}><Badge status={online.has(d.device_id) ? 'ready' : 'closed'} label={online.has(d.device_id) ? 'Online' : 'Offline'} /><Button small variant="ghost" label="Edit" onPress={() => { setEditing(d); setRole(d.role_id ?? 'role-waiter'); setName(d.name); }} /></Row>} />
        ))}</Card>
      )}

      <Sheet visible={!!approving} onClose={() => setApproving(null)} title="Approve device">
        <Field label="Device name" value={name} onChangeText={setName} />
        <SelectField label="Role" value={role} options={roleOptions} onChange={setRole} />
        <Button label="Approve" icon="checkmark" onPress={() => act(() => s.parent!.approve(approving!.id, name.trim() || approving!.name, role), 'Device approved')} />
      </Sheet>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.name}>
        <Field label="Device name" value={name} onChangeText={setName} />
        <SelectField label="Role" value={role} options={roleOptions} onChange={setRole} />
        <View style={{ gap: 10 }}>
          <Button label="Save" onPress={() => act(() => s.parent!.setRole(editing!.device_id, role, name.trim()), 'Saved')} />
          <Button label="Remove device" variant="danger" onPress={async () => { if (await confirm('This device will be disconnected and can no longer use the network.', { danger: true, okLabel: 'Remove' })) await act(() => s.parent!.revoke(editing!.device_id), 'Device removed'); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
