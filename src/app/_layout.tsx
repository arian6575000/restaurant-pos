import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../ctx/AppContext';
import { SessionProvider, useSession } from '../runtime/session';
import { LockScreen } from '../ui/LockScreen';
import { hasPin } from '../lib/lock';
import { C } from '../lib/theme';

function Gate() {
  const { erase } = useSession();
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => { hasPin().then(setLocked); }, []);
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
      {locked ? <LockScreen onUnlock={() => setLocked(false)} onErase={erase} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <SessionProvider>
            <StatusBar style="dark" />
            <Gate />
          </SessionProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
