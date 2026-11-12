// Everything behind the gate: Parent needs a valid license; a Child needs approval and a fresh Parent heartbeat.
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../runtime/session';
import LicenseGate from '../../license/LicenseGate';
import { ParentLicenseBridge } from '../../runtime/ParentLicenseBridge';
import ChildGate from '../../screens/ChildGate';
import { Loading, color } from '../../design';

export default function AppLayout() {
  const s = useSession();
  if (!s.ready) return <Loading />;
  if (!s.mode) return <Redirect href="/" />;
  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }} />;
  return s.mode === 'parent'
    ? <LicenseGate><ParentLicenseBridge />{stack}</LicenseGate>
    : <ChildGate>{stack}</ChildGate>;
}
