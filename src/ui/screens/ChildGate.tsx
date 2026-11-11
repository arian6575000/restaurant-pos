// A Child shows the working app only while approved and its Parent heartbeat lease is valid (it has no license of its own).
import React from 'react';
import { Button, Card, Credit, Muted, Screen, T, Avatar } from '../kit';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';

export default function ChildGate({ children }: { children: React.ReactNode }) {
  const { childStatus: st, child, erase } = useSession();
  const { confirm } = useApp();
  if (!st) return <Screen title="Restaurant POS"><Muted>Connecting…</Muted></Screen>;
  const blocked = st.membership === 'active' && st.lease !== 'ok';
  if (st.membership === 'active' && !blocked) return <>{children}</>;

  let icon: any = 'time', title = 'Waiting for Parent approval', text = 'Ask the Parent device to approve this device and choose its role. Keep the Parent app open nearby.';
  if (st.membership === 'rejected') { icon = 'close-circle'; title = 'Request declined'; text = 'The Parent did not approve this device. You can reset and try again with a new QR code.'; }
  if (st.membership === 'revoked') { icon = 'ban'; title = 'Device removed'; text = 'The Parent removed this device from the network. Reset to join again.'; }
  if (blocked) {
    icon = 'lock-closed'; title = 'Connect to the Parent device';
    text = st.lease === 'license_expired' ? reasonText('license_expired') : st.lease === 'clock' ? reasonText('clock') : reasonText('lease_grace_expired');
  }
  const reset = async () => { if (await confirm('This removes all data on this device and returns to the start screen.', { danger: true, okLabel: 'Reset device' })) await erase(); };
  return (
    <Screen title="Restaurant POS">
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 28 }}>
        <Avatar icon={icon} size={64} /><T bold size={18} center>{title}</T><Muted style={{ textAlign: 'center' }}>{text}</Muted>
        <Muted>{st.connected ? 'Connected to Parent' : 'Searching for Parent…'}{st.pendingEvents ? ` · ${st.pendingEvents} change(s) waiting to sync` : ''}</Muted>
      </Card>
      {!st.connected && st.membership !== 'rejected' && st.membership !== 'revoked' ? <Button label="Try again" icon="refresh" variant="ghost" onPress={() => { void child?.reconnect(); }} style={{ marginTop: 12 }} /> : null}
      {st.membership === 'rejected' || st.membership === 'revoked' ? <Button label="Reset this device" variant="danger" onPress={reset} style={{ marginTop: 12 }} /> : null}
      <Credit />
    </Screen>
  );
}
