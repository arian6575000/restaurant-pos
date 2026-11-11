// Menu & tables management (Parent / roles with menu.manage / tables.manage). Prices are entered in major units and stored in minor units.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, CheckRow, Field, ListItem, Muted, NumField, Row, Screen, SectionLabel, SelectField, Sheet, Card, Empty } from '../kit';
import { reasonText, useSession } from '../../runtime/session';
import { useApp } from '../../ctx/AppContext';
import { useLoad } from '../../lib/hooks';
import { uuid } from '../../core/util';
import { moneyMinor, parseMinor } from '../../lib/format';

interface P { id: string; name: string; price: number; category_id: string | null; available: number }
type Edit = { kind: 'cat'; id?: string; name: string } | { kind: 'product'; id?: string; name: string; price: string; cat: string; available: boolean } | { kind: 'table'; id?: string; name: string; seats: string };

export default function Menu() {
  const s = useSession(); const { toast, confirm } = useApp();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [data, reload] = useLoad(async () => {
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
    else { const price = parseMinor(edit.price); if (price === null) { toast('Enter a valid price', 'error'); return; } r = await s.run('PRODUCT_UPSERTED', 'product', edit.id ?? uuid(), { name: edit.name.trim(), price, categoryId: edit.cat || null, available: edit.available }); }
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
  const canMenu = s.can('menu.manage'), canTables = s.can('tables.manage');
  const row = (key: string, title: string, sub: string, onPress: () => void, last: boolean) => <ListItem key={key} title={title} sub={sub} onPress={onPress} last={last} />;

  return (
    <Screen title="Menu & tables" back onRefresh={reload}>
      {canMenu && <>
        <SectionLabel right={<Button small variant="ghost" icon="add" label="Category" onPress={() => setEdit({ kind: 'cat', name: '' })} />}>Categories</SectionLabel>
        {data?.cats.length ? <Card flush>{data.cats.map((c, i) => row(c.id, c.name, '', () => setEdit({ kind: 'cat', id: c.id, name: c.name }), i === data.cats.length - 1))}</Card> : <Muted>No categories yet.</Muted>}
        <SectionLabel right={<Button small variant="ghost" icon="add" label="Item" onPress={() => setEdit({ kind: 'product', name: '', price: '', cat: data?.cats[0]?.id ?? '', available: true })} />}>Menu items</SectionLabel>
        {data?.products.length ? <Card flush>{data.products.map((p, i) => row(p.id, p.name, `${moneyMinor(p.price)}${p.available ? '' : ' · unavailable'}`, () => setEdit({ kind: 'product', id: p.id, name: p.name, price: (p.price / 100).toFixed(2), cat: p.category_id ?? '', available: !!p.available }), i === data.products.length - 1))}</Card> : <Empty icon="fast-food-outline" title="No menu items" />}
      </>}
      {canTables && <>
        <SectionLabel right={<Button small variant="ghost" icon="add" label="Table" onPress={() => setEdit({ kind: 'table', name: '', seats: '4' })} />}>Tables</SectionLabel>
        {data?.tables.length ? <Card flush>{data.tables.map((t, i) => row(t.id, t.name, `${t.capacity} seats`, () => setEdit({ kind: 'table', id: t.id, name: t.name, seats: String(t.capacity) }), i === data.tables.length - 1))}</Card> : <Muted>No tables yet.</Muted>}
      </>}

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.id ? 'Edit' : 'Add'} ${edit.kind === 'cat' ? 'category' : edit.kind === 'table' ? 'table' : 'menu item'}` : ''}>
        {edit && <View style={{ gap: 4 }}>
          <Field label="Name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} />
          {edit.kind === 'product' && <>
            <NumField label="Price" value={edit.price} onChangeText={(v) => setEdit({ ...edit, price: v })} />
            <SelectField label="Category" value={edit.cat} options={(data?.cats ?? []).map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setEdit({ ...edit, cat: v })} />
            <CheckRow label="Available for ordering" value={edit.available} onChange={(v) => setEdit({ ...edit, available: v })} />
          </>}
          {edit.kind === 'table' && <NumField label="Seats" value={edit.seats} onChangeText={(v) => setEdit({ ...edit, seats: v })} />}
          <Row style={{ marginTop: 8 }}><Button block label="Save" icon="checkmark" onPress={save} disabled={!edit.name.trim()} />{edit.id ? <Button label="Delete" variant="danger" onPress={remove} /> : null}</Row>
        </View>}
      </Sheet>
    </Screen>
  );
}
