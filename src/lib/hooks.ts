import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Runs `fn` every time the screen gains focus; returns [data, reload]. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList): [T | null, () => Promise<void>] {
  const [data, setData] = useState<T | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => { try { setData(await fn()); } catch (e) { console.warn('load failed', e); } }, deps);
  useFocusEffect(useCallback(() => { run(); }, [run]));
  return [data, run];
}
