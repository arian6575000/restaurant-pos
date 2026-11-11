import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Credit, Field, Muted, Screen, T, Avatar } from '../kit';
import { Scanner } from '../Scanner';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';

type Step = 'choose' | 'parent' | 'child';

export default function Setup() {
  const { createRestaurant, joinWithQr } = useSession();
  const { toast } = useApp();
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState(''); const [device, setDevice] = useState('');
  const [scan, setScan] = useState(false); const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try { await createRestaurant(name); } catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); } finally { setBusy(false); }
  };
  const onCode = async (code: string) => {
    setScan(false); setBusy(true);
    try { await joinWithQr(code, device); toast('Request sent. Wait for the Parent to approve this device.', 'success'); }
    catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title="Restaurant POS" subtitle="Welcome">
      {step === 'choose' && (
        <View style={{ gap: 14 }}>
          <Card onPress={() => setStep('parent')}>
            <Avatar icon="restaurant" /><T bold size={17} style={{ marginTop: 10 }}>Set up this device as Parent</T>
            <Muted>Create the restaurant network. This device approves other devices and keeps the master records. Requires a license.</Muted>
          </Card>
          <Card onPress={() => setStep('child')}>
            <Avatar icon="phone-portrait" /><T bold size={17} style={{ marginTop: 10 }}>Join an existing restaurant</T>
            <Muted>Scan the QR code shown on the Parent device. Waiters, kitchen and cashier devices join this way.</Muted>
          </Card>
        </View>
      )}
      {step === 'parent' && (
        <View style={{ gap: 12 }}>
          <Field label="Restaurant name" value={name} onChangeText={setName} placeholder="e.g. Al-Noor Restaurant" />
          <Button label="Create restaurant" icon="checkmark" onPress={create} loading={busy} disabled={!name.trim()} />
          <Button label="Back" variant="ghost" onPress={() => setStep('choose')} />
        </View>
      )}
      {step === 'child' && (
        <View style={{ gap: 12 }}>
          <Field label="This device's name" value={device} onChangeText={setDevice} placeholder="e.g. Waiter 1" hint="Shown to the Parent when approving." />
          <Button label="Scan Parent QR code" icon="qr-code" onPress={() => setScan(true)} loading={busy} disabled={!device.trim()} />
          <Button label="Back" variant="ghost" onPress={() => setStep('choose')} />
          <Scanner visible={scan} onClose={() => setScan(false)} onCode={onCode} />
        </View>
      )}
      <Credit />
    </Screen>
  );
}
