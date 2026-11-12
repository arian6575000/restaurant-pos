// Ember component library. All screens are built from these; they adapt to window size via useLayout().
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text,
  TextInput, TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { color, font, radius, status as statusMap, typeScale, type Variant, type Weight } from './tokens';
import { useLayout } from './layout';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export { color, radius, font, statusMap };
export { useLayout } from './layout';

export const tap = (kind: 'light' | 'medium' | 'success' = 'light') => {
  try {
    if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch { /* no haptics on this device */ }
};

// ------------------------------------------------------------------ Text
interface TxtProps { children?: React.ReactNode; v?: Variant; color?: string; weight?: Weight; center?: boolean; lines?: number; style?: StyleProp<TextStyle>; num?: boolean; selectable?: boolean }
export function Txt({ children, v = 'body', color: c = color.ink, weight, center, lines, style, num, selectable }: TxtProps) {
  const t = typeScale[v];
  return (
    <Text selectable={selectable} numberOfLines={lines} style={[{ fontFamily: font[weight ?? t.weight], fontSize: t.size, lineHeight: t.line, color: c, textAlign: center ? 'center' : 'left' }, num && { fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
}
export const Soft = (p: TxtProps) => <Txt v="small" color={color.faint} {...p} />;

// ------------------------------------------------------------------ Layout bits
export function Row({ children, style, gap = 10, align = 'center', wrap, justify }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; align?: ViewStyle['alignItems']; wrap?: boolean; justify?: ViewStyle['justifyContent'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap', justifyContent: justify }, style]}>{children}</View>;
}
export const Spacer = ({ h = 12 }: { h?: number }) => <View style={{ height: h }} />;
export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color.line }, style]} />;

export function Card({ children, style, onPress, pad = 16, tone }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; pad?: number; tone?: 'primary' | 'plain' }) {
  const base: ViewStyle = { backgroundColor: tone === 'primary' ? color.primaryTint : color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: tone === 'primary' ? color.primaryTint2 : color.line, padding: pad };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={() => { tap(); onPress(); }} android_ripple={{ color: 'rgba(242,92,31,0.10)' }} style={({ pressed }) => [base, pressed && { backgroundColor: color.primaryTint }, style]}>{children}</Pressable>;
}

// ------------------------------------------------------------------ Buttons
type BtnVariant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'success';
interface BtnProps { label?: string; icon?: IconName; onPress?: () => void; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; disabled?: boolean; block?: boolean; style?: StyleProp<ViewStyle>; trailingIcon?: IconName }
const BTN: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.primary, fg: color.onPrimary }, tonal: { bg: color.primaryTint, fg: color.primaryDark },
  outline: { bg: color.surface, fg: color.ink, border: color.lineStrong }, ghost: { bg: 'transparent', fg: color.primaryDark },
  danger: { bg: color.dangerTint, fg: color.danger }, success: { bg: color.success, fg: '#fff' },
};
export function Button({ label, icon, trailingIcon, onPress, variant = 'primary', size = 'md', loading, disabled, block, style }: BtnProps) {
  const c = BTN[variant]; const h = size === 'lg' ? 56 : size === 'md' ? 48 : 38; const fs = size === 'sm' ? 13.5 : 15.5;
  const off = disabled || loading;
  return (
    <Pressable disabled={off} onPress={() => { tap(variant === 'primary' || variant === 'success' ? 'medium' : 'light'); onPress?.(); }}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [{ height: h, borderRadius: size === 'sm' ? radius.sm : radius.md, paddingHorizontal: size === 'sm' ? 12 : 18, backgroundColor: c.bg, borderWidth: c.border ? 1 : 0, borderColor: c.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, block && { alignSelf: 'stretch' }, style]}>
      {loading ? <ActivityIndicator color={c.fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={c.fg} /> : null}
      {label ? <Text style={{ color: c.fg, fontFamily: font.semibold, fontSize: fs }} numberOfLines={1}>{label}</Text> : null}
      {trailingIcon && !loading ? <Ionicons name={trailingIcon} size={18} color={c.fg} /> : null}
    </Pressable>
  );
}
export function IconButton({ icon, onPress, tint = color.ink, bg, size = 40, badge, label }: { icon: IconName; onPress?: () => void; tint?: string; bg?: string; size?: number; badge?: number; label?: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={() => { tap(); onPress?.(); }} android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: size / 2 }}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? (pressed ? color.primaryTint : 'transparent') }]}>
      <Ionicons name={icon} size={size * 0.52} color={tint} />
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Chips, segments, badges
export function Chip({ label, selected, onPress, icon, count, tint }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; count?: number; tint?: string }) {
  const bg = selected ? (tint ?? color.primary) : color.surface; const fg = selected ? '#fff' : color.soft;
  return (
    <Pressable onPress={() => { tap(); onPress?.(); }} style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: bg, borderWidth: 1, borderColor: selected ? (tint ?? color.primary) : color.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 13.5 }}>{label}</Text>
      {count !== undefined ? <View style={{ backgroundColor: selected ? 'rgba(255,255,255,0.28)' : color.primaryTint, borderRadius: 9, paddingHorizontal: 6, minWidth: 18, alignItems: 'center' }}><Text style={{ color: selected ? '#fff' : color.primaryDark, fontFamily: font.bold, fontSize: 11.5 }}>{count}</Text></View> : null}
    </Pressable>
  );
}
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>{children}</ScrollView>;
}
export function Segmented<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#EFEBE5', borderRadius: radius.md, padding: 4 }}>
      {items.map(([k, l]) => (
        <Pressable key={k} onPress={() => { tap(); onChange(k); }} style={{ flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: value === k ? color.surface : 'transparent' }}>
          <Text style={{ fontFamily: value === k ? font.bold : font.medium, color: value === k ? color.primaryDark : color.soft, fontSize: 14 }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Pill({ label, fg, bg, icon }: { label: string; fg: string; bg: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
export function StatusPill({ status: st, label }: { status: string; label?: string }) {
  const c = statusMap[st] ?? statusMap.open; return <Pill label={label ?? c.label} fg={c.fg} bg={c.bg} />;
}
export function IconTile({ icon, tone = 'primary', size = 44 }: { icon: IconName; tone?: 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'violet'; size?: number }) {
  const m = { primary: [color.primaryTint, color.primary], success: [color.successTint, color.success], info: [color.infoTint, color.info], warning: [color.warningTint, color.warning], danger: [color.dangerTint, color.danger], violet: [color.violetTint, color.violet] }[tone];
  return <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: m[0], alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={size * 0.5} color={m[1]} /></View>;
}

// ------------------------------------------------------------------ Stepper, Money
export function Stepper({ value, onChange, min = 0, max = 99, size = 36 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; size?: number }) {
  const b = (icon: IconName, d: number, on: boolean) => (
    <Pressable disabled={!on} onPress={() => { tap(); onChange(Math.min(max, Math.max(min, value + d))); }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: d > 0 ? color.primary : color.primaryTint, opacity: on ? 1 : 0.4 }}>
      <Ionicons name={icon} size={size * 0.55} color={d > 0 ? '#fff' : color.primaryDark} />
    </Pressable>
  );
  return <Row gap={10}>{b('remove', -1, value > min)}<Txt v="h3" num style={{ minWidth: 22, textAlign: 'center' }}>{value}</Txt>{b('add', 1, value < max)}</Row>;
}

// ------------------------------------------------------------------ Lists
export function ListRow({ title, sub, leading, trailing, onPress, chevron, last, danger }: { title: string; sub?: string; leading?: React.ReactNode; trailing?: React.ReactNode; onPress?: () => void; chevron?: boolean; last?: boolean; danger?: boolean }) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2, borderBottomColor: color.line }}>
      {leading}
      <View style={{ flex: 1 }}><Txt v="bodyM" color={danger ? color.danger : color.ink} lines={1}>{title}</Txt>{sub ? <Soft lines={2}>{sub}</Soft> : null}</View>
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={color.placeholder} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={() => { tap(); onPress(); }} android_ripple={{ color: 'rgba(242,92,31,0.08)' }}>{inner}</Pressable> : inner;
}
export const ListCard = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, overflow: 'hidden' }, style]}>{children}</View>;

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row justify="space-between" style={{ marginTop: 22, marginBottom: 10 }}>
      <Txt v="label" color={color.faint} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Txt>
      {action ? <Pressable onPress={onAction} hitSlop={10}><Txt v="smallM" color={color.primaryDark}>{action}</Txt></Pressable> : null}
    </Row>
  );
}

export function KpiTile({ icon, label, value, sub, tone = 'primary', onPress }: { icon: IconName; label: string; value: string; sub?: string; tone?: 'primary' | 'success' | 'info' | 'warning' | 'violet'; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 150 }} pad={14}>
      <IconTile icon={icon} tone={tone} size={38} />
      <Txt v="h1" num style={{ marginTop: 12 }} lines={1}>{value}</Txt>
      <Txt v="small" color={color.soft} lines={1}>{label}</Txt>
      {sub ? <Soft style={{ marginTop: 2 }} lines={1}>{sub}</Soft> : null}
    </Card>
  );
}

export function EmptyState({ icon = 'sparkles-outline', title, text, action, onAction }: { icon?: IconName; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 6 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><Ionicons name={icon} size={32} color={color.primary} /></View>
      <Txt v="h3" center>{title}</Txt>
      {text ? <Txt v="small" color={color.faint} center style={{ maxWidth: 320 }}>{text}</Txt> : null}
      {action ? <View style={{ marginTop: 12 }}><Button label={action} variant="tonal" onPress={onAction} /></View> : null}
    </View>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.45)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(a, { toValue: 0.45, duration: 700, useNativeDriver: true })])); l.start(); return () => l.stop(); }, [a]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: '#EAE5DE', opacity: a }, style]} />;
}
export const Loading = () => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}><ActivityIndicator size="large" color={color.primary} /></View>;

// ------------------------------------------------------------------ Inputs
interface FieldProps extends TextInputProps { label?: string; hint?: string; error?: string; prefix?: string; suffix?: string }
export function Field({ label, hint, error, prefix, suffix, style, multiline, ...rest }: FieldProps) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="smallM" color={color.soft}>{label}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', backgroundColor: color.surface, borderRadius: radius.md, borderWidth: focus || error ? 2 : 1, borderColor: error ? color.danger : focus ? color.primary : color.lineStrong, paddingHorizontal: focus || error ? 13 : 14 }}>
        {prefix ? <Txt color={color.faint} style={{ marginRight: 6 }}>{prefix}</Txt> : null}
        <TextInput {...rest} multiline={multiline} placeholderTextColor={color.placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[{ flex: 1, minHeight: multiline ? 88 : 48, paddingVertical: multiline ? 12 : 0, fontFamily: font.regular, fontSize: 16, color: color.ink, textAlignVertical: multiline ? 'top' : 'center' }, style]} />
        {suffix ? <Txt color={color.faint} style={{ marginLeft: 6 }}>{suffix}</Txt> : null}
      </View>
      {error ? <Txt v="small" color={color.danger}>{error}</Txt> : hint ? <Soft>{hint}</Soft> : null}
    </View>
  );
}
export function SearchBar({ value, onChangeText, placeholder = 'Search' }: { value: string; onChangeText: (s: string) => void; placeholder?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: color.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, paddingHorizontal: 14, height: 46 }}>
      <Ionicons name="search" size={18} color={color.faint} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={color.placeholder} style={{ flex: 1, fontFamily: font.regular, fontSize: 15.5, color: color.ink }} />
      {value ? <Pressable onPress={() => onChangeText('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={color.placeholder} /></Pressable> : null}
    </View>
  );
}
export function Switch({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => { tap(); onChange(!value); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><Txt v="bodyM">{label}</Txt>{sub ? <Soft>{sub}</Soft> : null}</View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? color.primary : '#D9D3CB', padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}><View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} /></View>
    </Pressable>
  );
}

// ------------------------------------------------------------------ Sheet (bottom sheet on phones, centred dialog on larger windows)
export function Sheet({ visible, onClose, title, children, scroll, footer }: { visible: boolean; onClose: () => void; title?: string; children?: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  const L = useLayout(); const ins = useSafeAreaInsets(); const centered = L.cls !== 'compact';
  const body = scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>{children}</ScrollView> : <View style={{ gap: 14 }}>{children}</View>;
  return (
    <Modal visible={visible} transparent animationType={centered ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: centered ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]} onPress={onClose} />
        <View style={[{ backgroundColor: color.surface, width: '100%', maxWidth: centered ? 560 : undefined, maxHeight: L.height * (centered ? 0.88 : 0.9), padding: 20, paddingBottom: 20 + (centered ? 0 : ins.bottom), elevation: 12, gap: 14 },
          centered ? { borderRadius: radius.xl } : { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
          {!centered ? <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.lineStrong, marginTop: -8 }} /> : null}
          <Row justify="space-between">
            <Txt v="h2" style={{ flex: 1 }} lines={1}>{title ?? ''}</Txt>
            <IconButton icon="close" onPress={onClose} size={38} bg="#F1EDE7" />
          </Row>
          {body}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ------------------------------------------------------------------ Page chrome
export function TopBar({ title, subtitle, back, right, large }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; large?: boolean }) {
  const L = useLayout();
  return (
    <View style={{ paddingHorizontal: L.gutter, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {back ? <IconButton icon="arrow-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} bg={color.surface} label="Back" /> : null}
      <View style={{ flex: 1 }}>
        {subtitle ? <Txt v="label" color={color.primaryDark} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }} lines={1}>{subtitle}</Txt> : null}
        <Txt v={large ? 'display' : 'h1'} lines={1} style={large ? { fontSize: L.cls === 'compact' ? 28 : 32 } : undefined}>{title}</Txt>
      </View>
      {right}
    </View>
  );
}

/** Standard page: safe area, top bar, scrollable centred content with responsive gutters. `fill` disables the scroll wrapper for custom pane layouts. */
export function Page({ title, subtitle, back, right, children, onRefresh, fill, large, bottomPad = 24, wide }: {
  title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; children?: React.ReactNode; onRefresh?: () => void | Promise<void>; fill?: boolean; large?: boolean; bottomPad?: number; wide?: boolean;
}) {
  const L = useLayout(); const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? <RefreshControl refreshing={refreshing} tintColor={color.primary} colors={[color.primary]} onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }} /> : undefined;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: color.bg }}>
      <TopBar title={title} subtitle={subtitle} back={back} right={right} large={large} />
      {fill ? <View style={{ flex: 1 }}>{children}</View> : (
        <ScrollView refreshControl={refresh} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: L.gutter, paddingBottom: bottomPad, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: wide ? 1400 : L.maxContent }}>{children}</View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Grid that picks its column count from the available width (cards at least `min` wide). */
export function Grid({ children, min = 160, gap = 12, style }: { children: React.ReactNode; min?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0);
  const cols = w ? Math.max(1, Math.floor((w + gap) / (min + gap))) : 1;
  const kids = React.Children.toArray(children);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]}>
      {w ? kids.map((k, i) => <View key={i} style={{ width: (w - gap * (cols - 1)) / cols }}>{k}</View>) : null}
    </View>
  );
}

export function Banner({ tone = 'info', icon, text, action, onAction }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; text: string; action?: string; onAction?: () => void }) {
  const m = { info: [color.infoTint, color.info], warning: [color.warningTint, color.warning], danger: [color.dangerTint, color.danger], success: [color.successTint, color.success] }[tone];
  return (
    <Row style={{ backgroundColor: m[0], borderRadius: radius.md, padding: 12 }} gap={10}>
      <Ionicons name={icon ?? 'information-circle'} size={20} color={m[1]} />
      <Txt v="small" color={color.ink} style={{ flex: 1 }}>{text}</Txt>
      {action ? <Pressable onPress={onAction}><Txt v="smallM" color={m[1]}>{action}</Txt></Pressable> : null}
    </Row>
  );
}

const s = StyleSheet.create({
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontFamily: font.bold, fontSize: 10.5 },
});
