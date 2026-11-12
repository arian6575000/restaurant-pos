import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text,
  TextInput, TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useApp } from '../ctx/AppContext';
import { C, FONT_UR, FONT_UR_BOLD, shadow, shadowSm, STATUS_COLORS, TONES } from '../lib/theme';
import { Fmt } from '../lib/format';
import { parseYmd, ymd } from '../lib/dates';
import { CREDIT } from '../lib/brand';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------- Text
interface TProps { children?: React.ReactNode; size?: number; bold?: boolean; color?: string; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number; selectable?: boolean }
export function T({ children, size = 15, bold, color = C.ink, style, center, numberOfLines, selectable }: TProps) {
  const { rtl } = useApp();
  const base: TextStyle = rtl
    ? { fontSize: size + 1, color, textAlign: center ? 'center' : 'right', fontFamily: bold ? FONT_UR_BOLD : FONT_UR, lineHeight: Math.round(size * 2.05), writingDirection: 'rtl' }
    : { fontSize: size, color, textAlign: center ? 'center' : 'left', fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular' };
  return <Text selectable={selectable} numberOfLines={numberOfLines} style={[base, style]}>{children}</Text>;
}
export const Muted = (p: TProps) => <T size={13} color={C.faint} {...p} />;

// ---------------------------------------------------------------- Layout
export function Row({ children, style, gap = 10, align = 'center', wrap }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; align?: ViewStyle['alignItems']; wrap?: boolean }) {
  const { rtl } = useApp();
  return <View style={[{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Card({ children, style, onPress, flush }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; flush?: boolean }) {
  const inner = [styles.card, flush && { paddingVertical: 6 }, style];
  // no opacity change on press: opacity < 1 on an elevated view makes Android flash a shadow box
  if (onPress) return <Pressable onPress={onPress} android_ripple={{ color: 'rgba(62,107,255,0.10)' }} style={({ pressed }) => [inner, pressed && { backgroundColor: '#EEF2FF' }]}>{children}</Pressable>;
  return <View style={inner}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 18, marginBottom: 8, paddingHorizontal: 4 }}>
      <T size={13} bold color={C.faint} style={{ letterSpacing: 0.3 }}>{children}</T>
      {right}
    </Row>
  );
}

export function KV({ k, v, vColor }: { k: string; v: React.ReactNode; vColor?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }} gap={12} align="flex-start">
      <T size={13.5} color={C.faint} style={{ flexShrink: 0 }}>{k}</T>
      {typeof v === 'string' || typeof v === 'number' ? <T bold size={14} color={vColor} style={{ flex: 1, textAlign: undefined }}>{v}</T> : v}
    </Row>
  );
}

export function Divider() { return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line }} />; }

// ---------------------------------------------------------------- Buttons
interface BProps { label?: string; icon?: IconName; onPress?: () => void; variant?: 'primary' | 'ghost' | 'danger'; small?: boolean; block?: boolean; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle> }
export function Button({ label, icon, onPress, variant = 'primary', small, block, disabled, loading, style }: BProps) {
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? C.danger : C.primary;
  const content = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={fg} /> : null}
      {label ? <T bold size={small ? 13 : 15} color={fg} style={{ textAlign: 'center' }}>{label}</T> : null}
    </Row>
  );
  const wrap: ViewStyle = { borderRadius: small ? 12 : 16, overflow: 'hidden', opacity: disabled ? 0.5 : 1, ...(block ? { flex: 1 } : {}) };
  return (
    <Pressable disabled={disabled || loading} onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.25)' }} style={({ pressed }) => [wrap, pressed && Platform.OS !== 'android' && { opacity: 0.8 }, style]}>
      {variant === 'primary' ? (
        <LinearGradient colors={[C.primary, C.primary2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 20 }}>{content}</LinearGradient>
      ) : (
        <View style={{ paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 20, backgroundColor: variant === 'danger' ? 'rgba(255,71,87,0.1)' : 'rgba(62,107,255,0.10)' }}>{content}</View>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = C.ink, size = 20, style }: { icon: IconName; onPress?: () => void; color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} android_ripple={{ color: 'rgba(62,107,255,0.15)', radius: 22 }} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: '#EEF2FF' }, style]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- Screen + TopBar
interface ScreenProps {
  title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode; children?: React.ReactNode;
  scroll?: boolean; onRefresh?: () => Promise<void> | void; padBottom?: number; edges?: ('top' | 'bottom')[];
}
export function Screen({ title, subtitle, back, right, children, scroll = true, onRefresh, padBottom = 40, edges = ['top'] }: ScreenProps) {
  const { rtl } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: padBottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1, padding: 16 }}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: C.bg }}>
      {(title || back) && (
        <Row style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6, minHeight: 52 }} gap={10}>
          {back ? <IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <View style={{ width: back === false ? 0 : 0 }} />}
          <View style={{ flex: 1 }}>
            {subtitle ? <Muted style={{ fontWeight: '600' }}>{subtitle}</Muted> : null}
            <T size={22} bold numberOfLines={1}>{title}</T>
          </View>
          {right}
        </Row>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{body}</KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Loading() {
  const { t } = useApp();
  return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={C.primary} /><Muted style={{ marginTop: 10 }}>{t('loading')}</Muted></View>;
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
      <View style={[styles.round(56), { backgroundColor: TONES.blue.bg }]}><Ionicons name={icon} size={26} color={C.primary} /></View>
      <T bold size={17} center style={{ marginTop: 12 }}>{title}</T>
      {text ? <T size={13.5} color={C.faint} center style={{ marginTop: 4 }}>{text}</T> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- Inputs
interface FProps extends Omit<TextInputProps, 'style' | 'onChangeText'> { label?: string; onChangeText?: (v: string) => void; style?: StyleProp<ViewStyle>; hint?: string; ltr?: boolean }
export function Field({ label, style, hint, ltr, multiline, ...rest }: FProps) {
  const { rtl } = useApp();
  const alignRight = rtl && !ltr;
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <T size={12.5} bold color={C.soft} style={{ marginBottom: 6 }}>{label}</T> : null}
      <TextInput
        {...rest} multiline={multiline} placeholderTextColor="#A7ABBA"
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }, { textAlign: alignRight ? 'right' : 'left', writingDirection: alignRight ? 'rtl' : 'ltr' }, alignRight && { fontFamily: FONT_UR }]}
      />
      {hint ? <Muted style={{ marginTop: 4 }}>{hint}</Muted> : null}
    </View>
  );
}
export const NumField = (p: FProps) => <Field keyboardType="decimal-pad" ltr {...p} />;

export function Segmented<V extends string>({ items, value, onChange }: { items: [V, string][]; value: V; onChange: (v: V) => void }) {
  const { rtl } = useApp();
  return (
    <View style={[styles.segmented, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {items.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.segBtn, v === value && styles.segActive]}>
          <T size={13.5} bold={v === value} color={v === value ? C.primary : C.soft} center numberOfLines={1}>{label}</T>
        </Pressable>
      ))}
    </View>
  );
}

export function Chips<V extends string>({ items, value, onChange }: { items: [V, string][]; value: V; onChange: (v: V) => void }) {
  const { rtl } = useApp();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }} contentContainerStyle={{ gap: 8, flexDirection: rtl ? 'row-reverse' : 'row', paddingHorizontal: 2 }}>
      {items.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.chip, v === value && styles.chipOn]}>
          <T size={13.5} bold color={v === value ? '#fff' : C.soft}>{label}</T>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const { rtl } = useApp();
  return (
    <Row style={[styles.search]} gap={8}>
      <Ionicons name="search" size={18} color={C.faint} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A7ABBA"
        style={{ flex: 1, fontSize: 15, paddingVertical: 10, color: C.ink, textAlign: rtl ? 'right' : 'left', fontFamily: rtl ? FONT_UR : undefined }} />
      {value ? <IconButton icon="close-circle" size={18} color={C.faint} onPress={() => onChangeText('')} style={{ width: 28, height: 28, backgroundColor: 'transparent' }} /> : null}
    </Row>
  );
}

export function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)}>
      <Row gap={10} style={{ paddingVertical: 12 }}>
        <View style={[styles.check, value && { backgroundColor: C.primary, borderColor: C.primary }]}>{value ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</View>
        <T bold size={14}>{label}</T>
      </Row>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Date + Select
export function DateField({ label, value, onChange, clearable }: { label?: string; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  const { lang, t, rtl } = useApp();
  const [iosOpen, setIosOpen] = useState(false);
  const [tmp, setTmp] = useState<Date>(value ? parseYmd(value) : new Date());
  const open = () => {
    const cur = value ? parseYmd(value) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: cur, mode: 'date', onChange: (e, d) => { if (e.type === 'set' && d) onChange(ymd(d)); } });
    } else { setTmp(cur); setIosOpen(true); }
  };
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      {label ? <T size={12.5} bold color={C.soft} style={{ marginBottom: 6 }}>{label}</T> : null}
      <Pressable onPress={open} style={[styles.input, { flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingVertical: 11 }]}>
        <Ionicons name="calendar-outline" size={18} color={C.faint} />
        <T size={15} color={value ? C.ink : '#A7ABBA'} style={{ flex: 1 }}>{value ? Fmt.date(value, lang, true) : t('pickDate')}</T>
        {clearable && value ? <Pressable hitSlop={10} onPress={() => onChange('')}><Ionicons name="close-circle" size={18} color={C.faint} /></Pressable> : null}
      </Pressable>
      {Platform.OS === 'ios' && (
        <Sheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label}>
          <DateTimePicker value={tmp} mode="date" display="inline" onChange={(_e, d) => d && setTmp(d)} />
          <Row style={{ marginTop: 8 }}><Button block label={t('done')} onPress={() => { onChange(ymd(tmp)); setIosOpen(false); }} /></Row>
        </Sheet>
      )}
    </View>
  );
}

export interface Option { value: string; label: string; sub?: string; group?: string }
export function SelectField({ label, value, options, onChange, placeholder, searchable, footer }: {
  label?: string; value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string; searchable?: boolean; footer?: React.ReactNode;
}) {
  const { t, rtl } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = options.find((o) => o.value === value);
  const list = useMemo(() => (q.trim() ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : options), [options, q]);
  let lastGroup: string | undefined;
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      {label ? <T size={12.5} bold color={C.soft} style={{ marginBottom: 6 }}>{label}</T> : null}
      <Pressable onPress={() => { setQ(''); setOpen(true); }} style={[styles.input, { flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingVertical: 11 }]}>
        <T size={15} color={cur ? C.ink : '#A7ABBA'} style={{ flex: 1 }} numberOfLines={1}>{cur ? cur.label : placeholder || t('select')}</T>
        <Ionicons name="chevron-down" size={18} color={C.faint} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} scroll>
        {searchable ? <SearchBar value={q} onChangeText={setQ} placeholder={t('search')} /> : null}
        {list.map((o) => {
          const header = o.group && o.group !== lastGroup ? <Muted key={`g-${o.group}`} style={{ fontWeight: '700', paddingTop: 12, paddingBottom: 2 }}>{o.group}</Muted> : null;
          lastGroup = o.group;
          return (
            <React.Fragment key={o.value}>
              {header}
              <Pressable onPress={() => { onChange(o.value); setOpen(false); }} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
                <Row gap={8} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T size={15} bold={o.value === value} color={o.value === value ? C.primary : C.ink}>{o.label}</T>
                    {o.sub ? <Muted>{o.sub}</Muted> : null}
                  </View>
                  {o.value === value ? <Ionicons name="checkmark" size={18} color={C.primary} /> : null}
                </Row>
              </Pressable>
            </React.Fragment>
          );
        })}
        {!list.length ? <Muted style={{ paddingVertical: 20 }} center>{t('noMatches')}</Muted> : null}
        {footer}
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- Sheet
export function Sheet({ visible, onClose, title, children, scroll }: { visible: boolean; onClose: () => void; title?: string; children?: React.ReactNode; scroll?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {title ? <T bold size={18} center style={{ marginBottom: 10 }}>{title}</T> : null}
          {scroll ? <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>{children}</ScrollView> : children}
          <View style={{ height: 14 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Company credit line (RetailX Solution). */
export function Credit({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ alignItems: 'center', paddingVertical: 14 }, style]}><Text selectable style={{ fontSize: 11.5, color: C.faint, letterSpacing: 0.3 }}>{`Developed by ${CREDIT}`}</Text></View>;
}

// ---------------------------------------------------------------- Display bits
export function Badge({ status, label }: { status: string; label: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.open;
  return <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' }}><T size={11.5} bold color={c.fg}>{label}</T></View>;
}

export function Avatar({ text, icon, size = 44 }: { text?: string; icon?: IconName; size?: number }) {
  return (
    <LinearGradient colors={['rgba(62,107,255,0.18)', 'rgba(122,92,250,0.18)']} style={[styles.round(size), { borderRadius: size * 0.32 }]}>
      {icon ? <Ionicons name={icon} size={size * 0.46} color={C.primary} /> : <Text style={{ color: C.primary, fontWeight: '800', fontSize: size * 0.38 }}>{text}</Text>}
    </LinearGradient>
  );
}

export function ListItem({ title, sub, sub2, left, trail, onPress, last }: { title: React.ReactNode; sub?: React.ReactNode; sub2?: React.ReactNode; left?: React.ReactNode; trail?: React.ReactNode; onPress?: () => void; last?: boolean }) {
  const inner = (
    <Row gap={12} style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
      {left}
      <View style={{ flex: 1 }}>
        {typeof title === 'string' ? <T bold size={15} numberOfLines={1}>{title}</T> : title}
        {sub ? (typeof sub === 'string' ? <Muted numberOfLines={1}>{sub}</Muted> : sub) : null}
        {sub2 ? (typeof sub2 === 'string' ? <Muted numberOfLines={1}>{sub2}</Muted> : sub2) : null}
      </View>
      {trail ? <View style={{ alignItems: 'flex-end' }}>{trail}</View> : null}
    </Row>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{inner}</Pressable> : inner;
}

export function StatCard({ icon, tone, value, label, onPress, small }: { icon: IconName; tone: keyof typeof TONES; value: string | number; label: string; onPress?: () => void; small?: boolean }) {
  const tn = TONES[tone];
  const { rtl } = useApp();
  return (
    <Card onPress={onPress} style={{ flexBasis: '47%', flexGrow: 1, alignItems: rtl ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.round(36), { backgroundColor: tn.bg, borderRadius: 12 }]}><Ionicons name={icon} size={19} color={tn.fg} /></View>
      <T bold size={small ? 20 : 26} style={{ marginTop: 10 }} numberOfLines={1}>{String(value)}</T>
      <Muted>{label}</Muted>
    </Card>
  );
}

export function Hero({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Card style={{ paddingVertical: 20 }}>
      <Muted style={{ fontWeight: '600' }}>{label}</Muted>
      <T bold size={32} color={danger ? C.danger : C.ink} style={{ marginTop: 2 }}>{value}</T>
      {hint ? <Muted style={{ marginTop: 4 }}>{hint}</Muted> : null}
    </Card>
  );
}

export const Grid = ({ children }: { children?: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>{children}</View>;

// ---------------------------------------------------------------- styles
const styles = {
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line, ...shadow } as ViewStyle,
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, alignItems: 'center', justifyContent: 'center', ...shadowSm } as ViewStyle,
  input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(20,22,31,0.1)', paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.ink } as TextStyle,
  segmented: { backgroundColor: 'rgba(20,22,31,0.06)', borderRadius: 14, padding: 3 } as ViewStyle,
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 11, justifyContent: 'center' } as ViewStyle,
  segActive: { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, ...shadowSm } as ViewStyle,
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line } as ViewStyle,
  chipOn: { backgroundColor: C.primary, borderColor: C.primary } as ViewStyle,
  search: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line } as ViewStyle,
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#C3C7D6', alignItems: 'center', justifyContent: 'center' } as ViewStyle,
  overlay: { flex: 1, backgroundColor: 'rgba(10,14,30,0.45)' } as ViewStyle,
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#F7F8FC', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingTop: 10 } as ViewStyle,
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(20,22,31,0.18)', marginBottom: 12 } as ViewStyle,
  round: (s: number): ViewStyle => ({ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center' }),
};
