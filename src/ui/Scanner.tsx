import React, { useRef } from 'react';
import { Modal, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, Muted, T } from './kit';
import { useApp } from '../ctx/AppContext';

/** Full-screen barcode scanner. Calls onCode once per scan, then closes. */
export function Scanner({ visible, onClose, onCode }: { visible: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useApp();
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);
  React.useEffect(() => { if (visible) done.current = false; }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? (
          <CameraView
            style={{ flex: 1 }} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={(r) => { if (done.current) return; done.current = true; onCode(String(r.data).trim()); }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <T color="#fff" center style={{ marginBottom: 14 }}>{t('cameraDenied')}</T>
            <Button label={t('enable')} onPress={() => ask()} />
          </View>
        )}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 14 }}>
          <IconButton icon="close" onPress={onClose} />
        </SafeAreaView>
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, alignItems: 'center' }}>
          <Muted color="#fff">{t('scanHint')}</Muted>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
