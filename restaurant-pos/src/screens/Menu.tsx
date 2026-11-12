// Menu & tables management. Prices are typed in major units and stored in minor units.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, ChipRow, EmptyState, Field, IconTile, ListCard, ListRow, Page, Row, SectionHeader, Segmented, Sheet, Soft, Switch, Txt, color } from '../design';
import { reasonText, useSession } from '../runtime/session';
import { useApp } from '../ctx/AppContext';
import { useLoad } from '../lib/hooks';
import { uuid } from '../core/util';
import { moneyMinor, parseMinor } from '../lib/format';

interface P { id: string; name: string; price: number; category_id: string | null; available: number }
type Edit = { kind: 'cat'; id?: string; name: string } | { kind: 'product'; id?: string; name: string; price: string; cat: string; available: boolean } | { kind: 'table'; id?: string; name: string; seats: string };
type Tab = 'items' | 'cats' | 'tables';

export default function Menu() {
  const s = useSession(); const { toast, confirm } = useApp();
  const [tab, setTab] = useState<Tab>(s.can('menu.manage') ? 'items' : 'tables'); const [edit, setEdit] = useState<Edit | null>(null); const [catF, setCatF] = useState('all');
  const [d, reload] = useLoad(async () => {
    const db = s.db!;
    return {
      cats: await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM categories WHERE deleted = 0 ORDER BY sort, name'),
      products: await db.getAllAsync<P>('SELECT id, name, price, category_id, available FROM products WHERE deleted = 0 ORDER BY name'),
      tables: await db.getAllAsync<{ id: string; name: string; capacity: number }>('SELECT id, name, capacity FROM dining_tables WHERE deleted = 0 ORDER BY name'),
    };
  }, [s.rev]);

  const save = async () => {
    if (!edit) return; let r;
    if (edit.kind === 'cat') r = await s.run('CATEGORY_UPSERTED', 'category', edit.id ?? uuid(), { name: edit.name.trim() });
    else if (edit.kind === 'table') r = await s.run('TABLE_UPSERTED', 'table', edit.id ?? uuid(), { name: edit.name.trim(), capacity: Math.max(1, parseInt(edit.seats, 10) || 4) });
    else { const price = parseMinor(edit.price); if (price === null) { toast('Enter a valid price, e.g. 450 or 450.50', 'error'); return; } r = await s.run('PRODUCT_UPSERTED', 'product', edit.id ?? uuid(), { name: edit.name.trim(), price, categoryId: edit.cat || null, available: edit.available }); }
    if (!r.ok) { toast(reasonText(r.reason), 'error'); return; }
    setEdit(null); await reload();
  };
  const remove = async () => {
    if (!edit?.id || !(await confirm('Delete this entry? Existing orders keep their history.', { danger: true, okLabel: 'Delete' }))) return;
    const r = edit.kind === 'cat' ? await s.run('CATEGORY_UPSERTED', 'category', edit.id, { name: edit.name, deleted: true })
      : edit.kind === 'table' ? await s.run('TABLE_UPSERTED', 'table', edit.id, { name: edit.name, capacity: parseInt(edit.seats, 10) || 4, deleted: true })
      : await s.run('PRODUCT_UPSERTED', 'product', edit.id, { name: edit.name, price: parseMinor(edit.price) ?? 0, categoryId: edit.cat || null, deleted: true });
    if (!r.ok) toast(reasonText(r.reason), 'error'); setEdit(null); await reload();
  };
  const toggle = async (p: P) => { const r = await s.run('PRODUCT_UPSERTED', 'product', p.id, { name: p.name, price: p.price, categoryId: p.category_id, available: !p.available }); if (!r.ok) toast(reasonText(r.reason), 'error'); await reload(); };
  const canMenu = s.can('menu.manage'), canTables = s.can('tables.manage');
  const addLabel = tab === 'items' ? 'Add dish' : tab === 'cats' ? 'Add category' : 'Add table';
  const onAdd = () => setEdit(tab === 'items' ? { kind: 'product', name: '', price: '', cat: d?.cats[0]?.id ?? '', available: true } : tab === 'cats' ? { kind: 'cat', name: '' } : { kind: 'table', name: '', seats: '4' });
  const products = (d?.products ?? []).filter((p) => catF === 'all' || p.category_id === catF);

  return (
    <Page title="Menu & tables" subtitle="Manage" back onRefresh={reload} right={<Button size="sm" icon="add" label={addLabel} onPress={onAdd} />}>
      <Segmented items={[...(canMenu ? [['items', 'Dishes'], ['cats', 'Categories']] as [Tab, string][] : []), ...(canTables ? [['tables', 'Tables']] as [Tab, string][] : [])]} value={tab} onChange={setTab} />
      <View style={{ height: 14 }} />
      {tab === 'items' && <>
        <ChipRow><Chip label="All" selected={catF === 'all'} count={d?.products.length} onPress={() => setCatF('all')} />{(d?.cats ?? []).map((c) => <Chip key={c.id} label={c.name} selected={catF === c.id} onPress={() => setCatF(c.id)} />)}</ChipRow>
        <View style={{ height: 12 }} />
        {products.length === 0 ? <Card><EmptyState icon="fast-food-outline" title="No dishes yet" text="Add your dishes with prices. Waiters pick from this list." action="Add dish" onAction={onAdd} /></Card> : (
          <ListCard>{products.map((p, i) => (
            <ListRow key={p.id} last={i === products.length - 1} leading={<IconTile icon="fast-food" size={42} tone={p.available ? 'primary' : 'danger'} />} title={p.name} sub={`${moneyMinor(p.price)}${p.available ? '' : ' · Unavailable'}`} chevron
              onPress={() => setEdit({ kind: 'product', id: p.id, name: p.name, price: (p.price / 100).toFixed(2), cat: p.category_id ?? '', available: !!p.available })}
              trailing={<Button size="sm" variant={p.available ? 'tonal' : 'danger'} label={p.available ? 'Available' : '86'} onPress={() => toggle(p)} />} />
          ))}</ListCard>
        )}
      </>}
      {tab === 'cats' && (d?.cats.length ? <ListCard>{d.cats.map((c, i) => <ListRow key={c.id} last={i === d.cats.length - 1} leading={<IconTile icon="albums" size={42} tone="violet" />} title={c.name} sub={`${d.products.filter((p) => p.category_id === c.id).length} dishes`} chevron onPress={() => setEdit({ kind: 'cat', id: c.id, name: c.name })} />)}</ListCard> : <Card><EmptyState icon="albums-outline" title="No categories" text="Group dishes into categories like Starters, Mains and Drinks." action="Add category" onAction={onAdd} /></Card>)}
      {tab === 'tables' && (d?.tables.length ? <ListCard>{d.tables.map((t, i) => <ListRow key={t.id} last={i === d.tables.length - 1} leading={<IconTile icon="restaurant" size={42} tone="info" />} title={t.name} sub={`${t.capacity} seats`} chevron onPress={() => setEdit({ kind: 'table', id: t.id, name: t.name, seats: String(t.capacity) })} />)}</ListCard> : <Card><EmptyState icon="restaurant-outline" title="No tables" text="Add the tables of your dining area." action="Add table" onAction={onAdd} /></Card>)}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.id ? 'Edit' : 'New'} ${edit.kind === 'cat' ? 'category' : edit.kind === 'table' ? 'table' : 'dish'}` : ''} scroll>
        {edit && <>
          <Field label="Name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} autoFocus />
          {edit.kind === 'product' && <>
            <Field label="Price" value={edit.price} onChangeText={(v) => setEdit({ ...edit, price: v })} keyboardType="decimal-pad" prefix="Rs" />
            <View style={{ gap: 6 }}><Txt v="smallM" color={color.soft}>Category</Txt><ChipRow>{(d?.cats ?? []).map((c) => <Chip key={c.id} label={c.name} selected={edit.cat === c.id} onPress={() => setEdit({ ...edit, cat: c.id })} />)}</ChipRow></View>
            <Switch label="Available for ordering" sub="Turn off when the dish runs out (86)" value={edit.available} onChange={(v) => setEdit({ ...edit, available: v })} />
          </>}
          {edit.kind === 'table' && <Field label="Seats" value={edit.seats} onChangeText={(v) => setEdit({ ...edit, seats: v })} keyboardType="number-pad" />}
          <Button label="Save" icon="checkmark" size="lg" onPress={save} disabled={!edit.name.trim()} />
          {edit.id ? <Button label="Delete" variant="danger" onPress={remove} /> : null}
        </>}
      </Sheet>
    </Page>
  );
}
