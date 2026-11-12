import React from 'react';
import { Pill, color } from '../design';
import { useSession } from '../runtime/session';

/** Connection / sync state shown in every top bar. */
export function SyncChip() {
  const s = useSession();
  if (s.mode === 'parent') {
    const n = s.parent?.connectedDeviceIds().length ?? 0;
    return <Pill icon="radio" label={n ? `${n} online` : 'Hosting'} fg={color.success} bg={color.successTint} />;
  }
  const st = s.childStatus; if (!st) return null;
  if (!st.connected) return <Pill icon="cloud-offline" label={st.pendingEvents ? `Offline · ${st.pendingEvents} queued` : 'Offline'} fg={color.warning} bg={color.warningTint} />;
  if (st.pendingEvents) return <Pill icon="sync" label={`Syncing ${st.pendingEvents}`} fg={color.info} bg={color.infoTint} />;
  return <Pill icon="checkmark-circle" label="Synced" fg={color.success} bg={color.successTint} />;
}
