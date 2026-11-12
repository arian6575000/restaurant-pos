// A Child shows the working app only while approved and its Parent heartbeat lease is valid (it has no license of its own).
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Soft, Txt, color, useLayout } from '../design';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { CREDIT } from '../lib/brand';

export default function ChildGate({ children }: { children: React.ReactNode }) {
  const { childStatus: st, retryNetwork, erase } = useSession(); const { confirm } = useApp(); const L = useLayout();
  if (!st) return <SafeAreaView style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}><Soft>Connecting…</Soft></SafeAreaView>;
  const blocked = st.membership === 'active' && st.lease !== 'ok';
  if (st.membership === 'active' && !blocked) return <>{children}</>;

  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'time-outline', tint: string = color.warning, title = 'Waiting for approval', text = 'The Parent has received your request. Ask it to open Devices, approve this device and choose its role.';
  if (st.membership === 'enrolling') {
    icon = 'bluetooth-outline'; title = st.connected ? 'Sending your request' : 'Connecting to the Parent';
    text = st.connected ? 'Connected. Sending the join request to the Parent…' : 'Searching for the Parent device nearby. This can take up to a minute.';
  }
  if (st.membership === 'rejected') { icon = 'close-circle-outline'; tint = color.danger; title = 'Request declined'; text = 'The Parent did not approve this device. Reset and try again with a new QR code.'; }
  if (st.membership === 'revoked') { icon = 'ban-outline'; tint = color.danger; title = 'Device removed'; text = 'The Parent removed this device from the network. Reset to join again.'; }
  if (blocked) { icon = 'lock-closed-outline'; title = 'Reconnect to the Parent'; text = st.lease === 'license_expired' ? reasonText('license_expired') : st.lease === 'clock' ? reasonText('clock') : reasonText('lease_grace_expired'); }
  const dead = st.membership === 'rejected' || st.membership === 'revoked';
  const reset = async () => { if (await confirm('This removes all data on this device and returns to the start screen.', { danger: true, okLabel: 'Reset device' })) await erase(); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: L.gutter }}>
      <Card pad={28} style={{ width: '100%', maxWidth: 460, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={42} color={tint} /></View>
        <Txt v="h1" center>{title}</Txt>
        <Txt color={color.soft} center>{text}</Txt>
        {st.error && !st.connected ? <Soft center style={{ color: color.danger }}>{reasonText(st.error)}</Soft> : null}
        {st.membership === 'enrolling' && !st.connected ? <Soft center>Checklist: Bluetooth, Wi-Fi and Location are on · the Parent is showing its pairing QR on the Devices screen · both devices are close.</Soft> : null}
        <Soft center>{st.connected ? 'Connected to Parent' : 'Not connected yet'}{st.pendingEvents ? ` · ${st.pendingEvents} change(s) waiting to sync` : ''}</Soft>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 10 }}>
          {!dead ? <Button label="Retry now" icon="refresh" variant="tonal" onPress={() => { void retryNetwork(); }} /> : <Button label="Reset this device" variant="danger" onPress={reset} />}
        </View>
      </Card>
      <Soft style={{ marginTop: 16 }}>{CREDIT}</Soft>
    </SafeAreaView>
  );
}
