import React, { useEffect, useState } from 'react';
import { Button, Card, Credit, KV, Muted, Screen, SectionLabel, CheckRow } from '../kit';
import { useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { usePinPrompt } from '../PinPrompt';
import { biometricAvailable, biometricEnabled, hasPin, removePin, setBiometric, setPin, verifyPin } from '../../lib/lock';

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
    <Screen title="Settings" back>
      <Card>
        <KV k="Mode" v={s.mode === 'parent' ? 'Parent' : 'Child'} /><KV k="Role" v={s.roleName || '—'} />
        <KV k="Device ID" v={s.deviceId.slice(0, 8)} />
      </Card>
      <SectionLabel>Security</SectionLabel>
      <Card>
        <Muted>{pin ? 'A PIN protects this app when it opens.' : 'Protect the app with a 4-digit PIN.'}</Muted>
        {pin ? <Button label="Turn off PIN" variant="ghost" onPress={disablePin} style={{ marginTop: 8 }} /> : <Button label="Set PIN" icon="lock-closed" onPress={enablePin} style={{ marginTop: 8 }} />}
        {pin && bioOk ? <CheckRow label="Unlock with fingerprint / face" value={bio} onChange={async (v) => { await setBiometric(v); await refresh(); }} /> : null}
      </Card>
      <SectionLabel>Danger zone</SectionLabel>
      <Button label={s.mode === 'parent' ? 'Erase restaurant data' : 'Reset this device'} variant="danger" onPress={erase} />
      {prompt}
      <Credit />
    </Screen>
  );
}
