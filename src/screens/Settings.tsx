import React, { useEffect, useState } from 'react';
import { Button, Card, Divider, IconTile, ListCard, Page, Row, SectionHeader, Soft, Switch, Txt, color } from '../design';
import { useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { usePinPrompt } from '../ui/PinPrompt';
import { biometricAvailable, biometricEnabled, hasPin, removePin, setBiometric, setPin, verifyPin } from '../lib/lock';
import { CREDIT } from '../lib/brand';

export default function Settings() {
  const s = useSession(); const { toast, confirm } = useApp();
  const [prompt, ask] = usePinPrompt();
  const [pin, setHas] = useState(false); const [bio, setBio] = useState(false); const [bioOk, setBioOk] = useState(false);
  const refresh = async () => { setHas(await hasPin()); setBio(await biometricEnabled()); setBioOk(await biometricAvailable()); };
  useEffect(() => { void refresh(); }, []);

  const enablePin = async () => {
    const a = await ask('Choose a 4-digit PIN'); if (!a) return;
    const b = await ask('Repeat the PIN'); if (a !== b) { toast('PINs do not match', 'error'); return; }
    await setPin(a); toast('PIN enabled', 'success'); await refresh();
  };
  const disablePin = async () => {
    const p = await ask('Enter your PIN to turn it off'); if (!p) return;
    if (!(await verifyPin(p))) { toast('Wrong PIN', 'error'); return; }
    await removePin(); toast('PIN removed', 'success'); await refresh();
  };
  const erase = async () => {
    const msg = s.mode === 'parent' ? 'This permanently deletes the restaurant, all orders and the network on this device. Child devices will lose their Parent.' : 'This removes all data on this device. You can join again with a new QR code.';
    if (await confirm(msg, { danger: true, okLabel: 'Erase everything' })) await s.erase();
  };
  return (
    <Page title="Settings" subtitle="Device" back>
      <Card pad={16} style={{ gap: 10 }}>
        <Row gap={12}><IconTile icon={s.mode === 'parent' ? 'business' : 'phone-portrait'} size={48} /><View2 /></Row>
        <Divider />
        <Row justify="space-between"><Soft>Mode</Soft><Txt v="bodyM">{s.mode === 'parent' ? 'Parent' : 'Child'}</Txt></Row>
        <Row justify="space-between"><Soft>Role</Soft><Txt v="bodyM">{s.roleName || '–'}</Txt></Row>
        <Row justify="space-between"><Soft>Device ID</Soft><Txt v="bodyM" selectable>{s.deviceId.slice(0, 8)}</Txt></Row>
      </Card>
      <SectionHeader title="Security" />
      <Card pad={16} style={{ gap: 8 }}>
        <Soft>{pin ? 'A PIN protects this app when it opens.' : 'Protect the app with a 4-digit PIN.'}</Soft>
        {pin ? <Button label="Turn off PIN" variant="outline" onPress={disablePin} /> : <Button label="Set PIN" icon="lock-closed" onPress={enablePin} />}
        {pin && bioOk ? <Switch label="Unlock with fingerprint / face" value={bio} onChange={async (v) => { await setBiometric(v); await refresh(); }} /> : null}
      </Card>
      <SectionHeader title="Danger zone" />
      <Button label={s.mode === 'parent' ? 'Erase restaurant data' : 'Reset this device'} variant="danger" onPress={erase} />
      {prompt}
      <Soft center style={{ marginTop: 28 }}>{CREDIT}</Soft>
    </Page>
  );
  function View2() { return <Soft style={{ flex: 1 }}><Txt v="h3">{s.restaurantName || 'Restaurant POS'}</Txt>{'\n'}This device</Soft>; }
}
