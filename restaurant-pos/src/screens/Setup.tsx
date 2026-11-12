import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Field, IconTile, Txt, Soft, color, useLayout, Row } from '../design';
import { Scanner } from '../ui/Scanner';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { CREDIT } from '../lib/brand';

type Step = 'choose' | 'parent' | 'child';

export default function Setup() {
  const { createRestaurant, joinWithQr } = useSession(); const { toast } = useApp(); const L = useLayout();
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState(''); const [device, setDevice] = useState('');
  const [scan, setScan] = useState(false); const [busy, setBusy] = useState(false);

  const create = async () => { setBusy(true); try { await createRestaurant(name); } catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); } finally { setBusy(false); } };
  const onCode = async (code: string) => {
    setScan(false); setBusy(true);
    try { await joinWithQr(code, device); toast('Request sent. Wait for the Parent to approve this device.', 'success'); }
    catch (e: any) { toast(reasonText(e?.code ?? e?.message), 'error'); } finally { setBusy(false); }
  };

  const side = L.cls !== 'compact';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: L.gutter, alignItems: 'center', justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 760, gap: 24 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="restaurant" size={44} color="#fff" /></View>
            <Txt v="display" center>Restaurant POS</Txt>
            <Txt color={color.soft} center style={{ maxWidth: 420 }}>Orders, kitchen and billing on every device in your restaurant. Works offline, syncs when devices meet.</Txt>
          </View>

          {step === 'choose' && (
            <View style={{ flexDirection: side ? 'row' : 'column', gap: 14 }}>
              <Card onPress={() => setStep('parent')} style={{ flex: 1, gap: 10 }} pad={20}>
                <IconTile icon="business" size={52} />
                <Txt v="h2">Set up the main device</Txt>
                <Soft>Create your restaurant. This is the Parent device: it approves other devices, assigns roles and keeps the master records. Needs a license.</Soft>
              </Card>
              <Card onPress={() => setStep('child')} style={{ flex: 1, gap: 10 }} pad={20}>
                <IconTile icon="phone-portrait" size={52} tone="info" />
                <Txt v="h2">Join your restaurant</Txt>
                <Soft>Scan the QR code on the Parent device. Waiter, kitchen and cashier devices join this way, no license needed.</Soft>
              </Card>
            </View>
          )}

          {step === 'parent' && (
            <Card pad={20} style={{ gap: 14 }}>
              <Txt v="h2">Name your restaurant</Txt>
              <Field label="Restaurant name" value={name} onChangeText={setName} placeholder="e.g. Al-Noor Restaurant" />
              <Button label="Create restaurant" icon="checkmark" size="lg" onPress={create} loading={busy} disabled={!name.trim()} />
              <Button label="Back" variant="ghost" onPress={() => setStep('choose')} />
            </Card>
          )}

          {step === 'child' && (
            <Card pad={20} style={{ gap: 14 }}>
              <Txt v="h2">Name this device</Txt>
              <Field label="Device name" value={device} onChangeText={setDevice} placeholder="e.g. Waiter 1" hint="Shown on the Parent when it approves this device." />
              <Button label="Scan Parent QR code" icon="qr-code" size="lg" onPress={() => setScan(true)} loading={busy} disabled={!device.trim()} />
              <Button label="Back" variant="ghost" onPress={() => setStep('choose')} />
              <Scanner visible={scan} onClose={() => setScan(false)} onCode={onCode} />
            </Card>
          )}
          <Row justify="center"><Soft center>{CREDIT}</Soft></Row>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
