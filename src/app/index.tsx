import React from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '../runtime/session';
import { Loading } from '../design';
import Setup from '../screens/Setup';

export default function Index() {
  const s = useSession();
  if (!s.ready) return <Loading />;
  if (!s.mode) return <Setup />;
  return <Redirect href="/home" />;
}
