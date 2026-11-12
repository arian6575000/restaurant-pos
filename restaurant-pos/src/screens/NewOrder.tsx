import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, ChipRow, EmptyState, Field, Grid, Page, Row, SearchBar, Segmented, Sheet, Soft, Stepper, Txt, Divider, color, radius, tap, useLayout } from '../design';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { useLoad } from '../lib/hooks';
import { kvJson, listTables } from '../core/restaurant/store';
import { calcTotals } from '../core/restaurant/order';
import { uuid } from '../core/util';
import { moneyMinor } from '../lib/format';

interface P { id: string; name: string; price: number; category_id: string | null }
interface Cat { id: string; name: string }
type OType = 'dine_in' | 'takeaway' | 'delivery';
const TILE = ['#FFE7D6', '#E4F1FF', '#E6F7EC', '#FFF2CC', '#EFE6FF', '#FFE3EA'];

export default function NewOrder() {
  const s = useSession(); const L = useLayout(); const { toast } = useApp();
  const { tableId } = useLocalSearchParams<{ tableId?: string }>();
  const [type, setType] = useState<OType>(tableId ? 'dine_in' : 'takeaway');
  const [table, setTable] = useState(tableId ?? ''); const [note, setNote] = useState('');
  const [cat, setCat] = useState('all'); const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({}); const [lineNote, setLineNote] = useState<Record<string, string>>({});
  const [cartOpen, setCartOpen] = useState(false); const [busy, setBusy] = useState(false);

  const [d] = useLoad(async () => {
    const db = s.db!;
    return {
      products: await db.getAllAsync<P>('SELECT id, name, price, category_id FROM products WHERE deleted = 0 AND available = 1 ORDER BY name'),
      cats: await db.getAllAsync<Cat>('SELECT id, name FROM categories WHERE deleted = 0 ORDER BY sort, name'),
      tables: (await listTables(db)).filter((t) => !t.occupied),
      tax: (await kvJson<{ taxBps?: number }>(db, 'settings'))?.taxBps ?? 0,
    };
  }, [s.rev]);

  const products = d?.products ?? [];
  const shown = useMemo(() => products.filter((p) => (cat === 'all' || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), [products, cat, q]);
  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const count = lines.reduce((a, p) => a + qty[p.id], 0);
  const totals = calcTotals(lines.map((p) => ({ qty: qty[p.id], unitPrice: p.price })), 0, d?.tax ?? 0);
  const set = (id: string, n: number) => setQty((x) => ({ ...x, [id]: n }));
  const canSend = s.can('orders.submit');
  const ready = count > 0 && (type !== 'dine_in' || !!table);

  const submit = async (send: boolean) => {
    setBusy(true); const id = uuid();
    const r = await s.run('ORDER_CREATED', 'order', id, {
      orderType: type, tableId: type === 'dine_in' ? table : null, note, taxBps: d?.tax ?? 0, discount: 0,
      items: lines.map((p) => ({ id: uuid(), productId: p.id, name: p.name, qty: qty[p.id], unitPrice: p.price, note: lineNote[p.id] ?? '' })),
    });
    if (!r.ok) { setBusy(false); toast(reasonText(r.reason), 'error'); return; }
    if (send && canSend) { const r2 = await s.run('ORDER_STATUS_CHANGED', 'order', id, { from: 'open', to: 'sent_to_kitchen' }); if (!r2.ok) toast(reasonText(r2.reason), 'error'); }
    setBusy(false); tap('success'); setCartOpen(false);
    toast(send && canSend ? 'Order sent to the kitchen' : 'Order saved', 'success');
    if (send && canSend) router.back(); else router.replace({ pathname: '/order/[id]', params: { id } });
  };

  const menu = (
    <View style={{ flex: 1 }}>
      <View style={{ gap: 12, paddingBottom: 12 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search dishes" />
        <ChipRow><Chip label="All" selected={cat === 'all'} onPress={() => setCat('all')} />{(d?.cats ?? []).map((c) => <Chip key={c.id} label={c.name} selected={cat === c.id} onPress={() => setCat(c.id)} />)}</ChipRow>
      </View>
      {shown.length === 0 ? <Card><EmptyState icon="fast-food-outline" title={products.length ? 'No dishes found' : 'The menu is empty'} text={products.length ? 'Try another search or category.' : 'The Parent device must add menu items first.'} /></Card> : (
        <Grid min={L.wide ? 150 : 148} gap={10}>
          {shown.map((p, i) => {
            const n = qty[p.id] ?? 0;
            return (
              <Pressable key={p.id} onPress={() => { tap(); set(p.id, Math.min(99, n + 1)); }} style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: n ? 2 : 1, borderColor: n ? color.primary : color.line, overflow: 'hidden' }}>
                <View style={{ height: 84, backgroundColor: TILE[i % TILE.length], alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="display" color="rgba(0,0,0,0.22)">{p.name.slice(0, 1).toUpperCase()}</Txt>
                  {n > 0 ? <View style={{ position: 'absolute', top: 8, right: 8, minWidth: 26, height: 26, borderRadius: 13, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Txt v="smallM" color="#fff" num>{n}</Txt></View> : null}
                </View>
                <View style={{ padding: 10, gap: 2 }}><Txt v="bodyM" lines={2} style={{ minHeight: 42 }}>{p.name}</Txt><Txt v="smallM" color={color.primaryDark} num>{moneyMinor(p.price)}</Txt></View>
              </Pressable>
            );
          })}
        </Grid>
      )}
    </View>
  );

  const cart = (
    <View style={{ gap: 14 }}>
      <Segmented items={[['dine_in', 'Dine-in'], ['takeaway', 'Takeaway'], ['delivery', 'Delivery']]} value={type} onChange={setType} />
      {type === 'dine_in' && (
        <View style={{ gap: 6 }}>
          <Txt v="smallM" color={color.soft}>Table</Txt>
          {(d?.tables.length ?? 0) === 0 ? <Soft>No free tables right now.</Soft> : <ChipRow>{d!.tables.map((t) => <Chip key={t.id} label={t.name} selected={table === t.id} onPress={() => setTable(t.id)} />)}</ChipRow>}
        </View>
      )}
      <Divider />
      {lines.length === 0 ? <Soft center>Tap dishes to add them to the order.</Soft> : lines.map((p) => (
        <View key={p.id} style={{ gap: 6 }}>
          <Row justify="space-between" align="flex-start"><View style={{ flex: 1 }}><Txt v="bodyM" lines={2}>{p.name}</Txt><Soft>{moneyMinor(p.price)} each</Soft></View><Stepper value={qty[p.id]} onChange={(n) => set(p.id, n)} /></Row>
          <Field value={lineNote[p.id] ?? ''} onChangeText={(v) => setLineNote((x) => ({ ...x, [p.id]: v }))} placeholder="Note for kitchen (optional)" style={{ fontSize: 14, minHeight: 40 }} />
        </View>
      ))}
      <Field label="Order note" value={note} onChangeText={setNote} placeholder="Optional" />
      <Divider />
      <View style={{ gap: 4 }}>
        <Row justify="space-between"><Soft>Subtotal</Soft><Txt v="small" num>{moneyMinor(totals.subtotal)}</Txt></Row>
        {totals.tax > 0 ? <Row justify="space-between"><Soft>Tax</Soft><Txt v="small" num>{moneyMinor(totals.tax)}</Txt></Row> : null}
        <Row justify="space-between"><Txt v="h3">Total</Txt><Txt v="h2" num color={color.primaryDark}>{moneyMinor(totals.total)}</Txt></Row>
      </View>
      <View style={{ gap: 8 }}>
        {canSend ? <Button label="Send to kitchen" icon="flame" size="lg" disabled={!ready} loading={busy} onPress={() => submit(true)} /> : null}
        <Button label="Save order" variant={canSend ? 'outline' : 'primary'} size={canSend ? 'md' : 'lg'} disabled={!ready} loading={busy && !canSend} onPress={() => submit(false)} />
      </View>
    </View>
  );

  const twoPane = L.width >= 840;
  return (
    <Page title="New order" subtitle="Order" back fill>
      {twoPane ? (
        <Row align="stretch" gap={0} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: L.gutter, paddingTop: 4 }} keyboardShouldPersistTaps="handled">{menu}</ScrollView>
          <ScrollView style={{ width: 380, backgroundColor: color.surface, borderLeftWidth: 1, borderLeftColor: color.line }} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Txt v="h2" style={{ marginBottom: 12 }}>Current order</Txt>{cart}
          </ScrollView>
        </Row>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: L.gutter, paddingTop: 4, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">{menu}</ScrollView>
          <View style={{ position: 'absolute', left: L.gutter, right: L.gutter, bottom: 14 }}>
            <Pressable onPress={() => { tap('medium'); setCartOpen(true); }} style={{ height: 58, borderRadius: radius.lg, backgroundColor: color.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, elevation: 6 }}>
              <View style={{ minWidth: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}><Txt v="smallM" color="#fff" num>{count}</Txt></View>
              <Txt v="h3" color="#fff" style={{ flex: 1 }}>View order</Txt>
              <Txt v="h3" color="#fff" num>{moneyMinor(totals.total)}</Txt><Ionicons name="chevron-up" size={20} color="#fff" />
            </Pressable>
          </View>
          <Sheet visible={cartOpen} onClose={() => setCartOpen(false)} title="Current order" scroll>{cart}</Sheet>
        </View>
      )}
    </Page>
  );
}
