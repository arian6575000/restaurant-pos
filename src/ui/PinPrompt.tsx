import React, { useCallback, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useApp } from '../ctx/AppContext';
import { Button, Row, Sheet } from './kit';
import { C } from '../lib/theme';

/** Returns [element, ask]. `ask(title)` resolves with a 4-digit string or null. Render `element` somewhere in the screen. */
export function usePinPrompt(): [React.ReactElement, (title: string) => Promise<string | null>] {
  const { t, toast } = useApp();
  const [state, setState] = useState<{ title: string } | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((title: string) => new Promise<string | null>((resolve) => {
    resolver.current = resolve; setValue(''); setState({ title });
  }), []);
  const finish = (v: string | null) => { setState(null); resolver.current?.(v); resolver.current = null; };

  const el = (
    <Sheet visible={!!state} onClose={() => finish(null)} title={state?.title}>
      <View style={{ marginBottom: 16 }}>
        <TextInput
          value={value} onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, 4))} secureTextEntry keyboardType="number-pad" maxLength={4} autoFocus
          style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, fontSize: 26, letterSpacing: 12, textAlign: 'center', paddingVertical: 12, color: C.ink }} />
      </View>
      <Row>
        <Button block variant="ghost" label={t('cancel')} onPress={() => finish(null)} />
        <Button block label={t('confirm')} onPress={() => { if (!/^\d{4}$/.test(value)) { toast(t('pin4'), 'error'); return; } finish(value); }} />
      </Row>
    </Sheet>
  );
  return [el, ask];
}
