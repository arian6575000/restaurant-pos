import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chips, Empty, Field, ListItem, Muted, Row, Screen, SectionLabel, SelectField, Segmented, T, IconButton } from '../kit';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { useLoad } from '../../lib/hooks';
import { kvJson, listTables } from '../../core/restaurant/store';
import { uuid } from '../../core/util';
import { moneyMinor } from '../../lib/format';

interface P { id: string; name: string; price: number; category_id: string | null }
interface Cat { id: string; name: string }

export default function NewOrder() {
  const s = useSession(); const { toast } = useApp();
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const [type, setType] = useState<'dine_in' | 'takeaway' | 'delivery'>(tableId ? 'dine_in' : 'takeaway');
  const [table, setTable] = useState(tableId ?? ''); const [note, setNote] = useState('');
  const [cat, setCat] = useState('all'); const [qty, setQty] = useState<Record<string, number>>({}); const [busy, setBusy] = useState(false);

  const [data] = useLoad(async () => {
    const db = s.db!;
    return {
      products: await db.getAllAsync<P>('SELECT id, name, price, category_id FROM products WHERE deleted = 0 AND available = 1 ORDER BY name'),
      cats: await db.getAllAsync<Cat>('SELECT id, name FROM categories WHERE deleted = 0 ORDER BY sort, name'),
      tables: (await listTables(db)).filter((t) => !t.occupied),
      tax: (await kvJson<{ taxBps?: number }>(db, 'settings'))?.taxBps ?? 0,
    };
  }, [s.rev]);

  const shown = useMemo(() => (data?.products ?? []).filter((p) => cat === 'all' || p.category_id === cat), [data, cat]);
  const lines = (data?.products ?? []).filter((p) => (qty[p.id] ?? 0) > 0);
  const subtotal = lines.reduce((a, p) => a + p.price * qty[p.id], 0);
  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] ?? 0) + d)) }));

  const submit = async () => {
    setBusy(true);
    const id = uuid();
    const r = await s.run('ORDER_CREATED', 'order', id, {
      orderType: type, tableId: type === 'dine_in' ? table : null, note, taxBps: data?.tax ?? 0, discount: 0,
      items: lines.map((p) => ({ id: uuid(), productId: p.id, name: p.name, qty: qty[p.id], unitPrice: p.price, note: '' })),
    });
    setBusy(false);
    if (!r.ok) { toast(reasonText(r.reason), 'error'); return; }
    toast('Order created', 'success'); router.replace({ pathname: '/order/[id]', params: { id } });
  };

  return (
    <Screen title="New order" back padBottom={110}>
      <Segmented items={[['dine_in', 'Dine-in'], ['takeaway', 'Takeaway'], ['delivery', 'Delivery']]} value={type} onChange={(v) => setType(v)} />
      {type === 'dine_in' && <SelectField label="Table" value={table} placeholder="Choose a free table" onChange={setTable}
        options={(data?.tables ?? []).map((t) => ({ value: t.id, label: t.name, sub: `${t.capacity} seats` }))} />}
      <Field label="Order note" value={note} onChangeText={setNote} placeholder="Optional" />
      <SectionLabel>Menu</SectionLabel>
      <Chips items={[['all', 'All'], ...(data?.cats ?? []).map((c) => [c.id, c.name] as [string, string])]} value={cat} onChange={setCat} />
      {shown.length === 0 ? <Empty icon="fast-food-outline" title="No menu items" text="The Parent device must add menu items first." /> : (
        <Card flush>{shown.map((p, i) => (
          <ListItem key={p.id} last={i === shown.length - 1} title={p.name} sub={moneyMinor(p.price)}
            trail={<Row gap={6}><IconButton icon="remove-circle-outline" onPress={() => bump(p.id, -1)} /><T bold style={{ minWidth: 22 }} center>{qty[p.id] ?? 0}</T><IconButton icon="add-circle" color="#3E6BFF" onPress={() => bump(p.id, 1)} /></Row>} />
        ))}</Card>
      )}
      <View style={{ marginTop: 16, gap: 8 }}>
        <Muted>{lines.length} item type(s) · subtotal {moneyMinor(subtotal)} (tax added on the bill)</Muted>
        <Button label="Create order" icon="checkmark" onPress={submit} loading={busy} disabled={type === 'dine_in' && !table} />
      </View>
    </Screen>
  );
}
