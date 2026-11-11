import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { translate, type Lang } from '../lib/i18n';
import { Fmt } from '../lib/format';
import { C } from '../lib/theme';

type ToastType = 'default' | 'success' | 'error';
interface Ctx {
  lang: Lang;
  rtl: false;
  t: (key: string, lang?: Lang) => string;
  toast: (msg: string, type?: ToastType) => void;
  confirm: (message: string, opts?: { title?: string; danger?: boolean; okLabel?: string }) => Promise<boolean>;
}
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

Fmt.currency = 'Rs';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [toastState, setToastState] = useState<{ msg: string; type: ToastType } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string, type: ToastType = 'default') => {
    if (timer.current) clearTimeout(timer.current);
    setToastState({ msg, type });
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToastState(null));
    }, 2400);
  }, [anim]);

  const t = useCallback((key: string) => translate(key), []);
  const confirm = useCallback((message: string, opts: { title?: string; danger?: boolean; okLabel?: string } = {}) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(opts.title || translate('areYouSure'), message, [
        { text: translate('cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: opts.okLabel || translate('confirm'), style: opts.danger ? 'destructive' : 'default', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    }), []);

  const value = useMemo<Ctx>(() => ({ lang: 'en', rtl: false, t, toast, confirm }), [t, toast, confirm]);
  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastState && (
        <Animated.View pointerEvents="none" style={[styles.toastWrap, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
          <View style={[styles.toast, toastState.type === 'error' && { backgroundColor: C.danger }, toastState.type === 'success' && { backgroundColor: '#0E9F6E' }]}>
            <Text style={styles.toastText}>{toastState.msg}</Text>
          </View>
        </Animated.View>
      )}
    </AppCtx.Provider>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 40, left: 16, right: 16, alignItems: 'center', zIndex: 999 },
  toast: { backgroundColor: '#1F2433', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, maxWidth: '100%' },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
