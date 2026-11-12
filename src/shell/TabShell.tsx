// Role-aware navigation chrome: bottom bar on phones, left rail on wide windows. Tabs are filtered by permission.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { color, font, radius, tap, type IconName } from '../design';
import type { Permission } from '../core/permissions';

type Can = (p: Permission) => boolean;
export interface TabDef { name: string; href: '/home' | '/tables' | '/orders' | '/kitchen' | '/more'; label: string; icon: IconName; iconOn: IconName; show: (can: Can, isParent: boolean) => boolean }

export const TABS: TabDef[] = [
  { name: 'home', href: '/home', label: 'Home', icon: 'grid-outline', iconOn: 'grid', show: (c) => c('reports.view') || c('billing.view') },
  { name: 'tables', href: '/tables', label: 'Tables', icon: 'restaurant-outline', iconOn: 'restaurant', show: (c) => c('tables.view') || c('orders.create') },
  { name: 'orders', href: '/orders', label: 'Orders', icon: 'receipt-outline', iconOn: 'receipt', show: (c) => c('orders.view') },
  { name: 'kitchen', href: '/kitchen', label: 'Kitchen', icon: 'flame-outline', iconOn: 'flame', show: (c) => c('kitchen.view') },
  { name: 'more', href: '/more', label: 'More', icon: 'ellipsis-horizontal-circle-outline', iconOn: 'ellipsis-horizontal-circle', show: () => true },
];

export function TabBar({ children, wide }: { children?: React.ReactNode; wide: boolean }) {
  const ins = useSafeAreaInsets();
  if (wide) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: 96, backgroundColor: color.surface, borderRightWidth: 1, borderRightColor: color.line, alignItems: 'center', paddingTop: 12, gap: 6 }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Ionicons name="restaurant" size={26} color="#fff" /></View>
        {children}
      </SafeAreaView>
    );
  }
  return (
    <View style={{ flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: Math.max(ins.bottom, 6), paddingTop: 6, paddingHorizontal: 8, elevation: 8 }}>
      {children}
    </View>
  );
}

export function TabButton({ icon, iconOn, label, wide, isFocused, onPress, ...rest }: { icon: IconName; iconOn: IconName; label: string; wide: boolean; isFocused?: boolean; onPress?: (e: any) => void }) {
    return (
      <Pressable {...(rest as object)} onPress={(e) => { tap(); onPress?.(e); }} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}
        style={{ flex: wide ? undefined : 1, width: wide ? 80 : undefined, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 3 }}>
        <View style={{ width: wide ? 56 : 58, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: isFocused ? color.primaryTint : 'transparent' }}>
          <Ionicons name={isFocused ? iconOn : icon} size={22} color={isFocused ? color.primaryDark : color.faint} />
        </View>
        <Text style={{ fontFamily: isFocused ? font.bold : font.medium, fontSize: 11.5, color: isFocused ? color.primaryDark : color.faint }}>{label}</Text>
      </Pressable>
    );
}
