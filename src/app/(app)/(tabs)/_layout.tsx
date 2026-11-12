import React from 'react';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { View } from 'react-native';
import { useSession } from '../../../runtime/session';
import { TabButton, TabBar, TABS } from '../../../shell/TabShell';
import { useLayout, color } from '../../../design';

export default function TabsLayout() {
  const s = useSession(); const L = useLayout();
  const visible = TABS.filter((t) => t.show(s.can, s.mode === 'parent'));
  const list = (
    <TabList asChild>
      <TabBar wide={L.wide}>
        {visible.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild><TabButton icon={t.icon} iconOn={t.iconOn} label={t.label} wide={L.wide} /></TabTrigger>
        ))}
      </TabBar>
    </TabList>
  );
  const slot = <View style={{ flex: 1 }}><TabSlot /></View>;
  // Expo Router only discovers TabTriggers when <TabList> is a direct child of <Tabs> (or of the single element
  // passed with `asChild`). Wrapping TabList in another View hides every trigger and no tab can open any screen.
  return (
    <Tabs asChild>
      <View style={{ flex: 1, flexDirection: L.wide ? 'row' : 'column', backgroundColor: color.bg }}>
        {L.wide ? list : slot}
        {L.wide ? slot : list}
      </View>
    </Tabs>
  );
}
