import React, { useEffect } from 'react';
import { useSession, licenseRef } from '../runtime/session';
import LicenseGate, { useLicense } from '../license/LicenseGate';
import { featureOn } from '../license/permissions';
import { Loading, Screen, T, Muted } from '../ui/kit';
import Setup from '../ui/screens/Setup';
import Home from '../ui/screens/Home';
import ChildGate from '../ui/screens/ChildGate';

/** Publishes the Parent's license state to the network layer. Children never see a license, only the Parent's heartbeat. */
function ParentLicenseBridge() {
  const lic = useLicense();
  useEffect(() => {
    if (!lic) { licenseRef.current = { validUntil: 0, allowChildren: false }; return; }
    const p = lic.payload;
    licenseRef.current = {
      validUntil: p.is_lifetime ? null : new Date(`${p.expiry_date}T23:59:59`).getTime(),
      allowChildren: featureOn(p.features, 'network.children'),
    };
  }, [lic]);
  return null;
}

export default function Index() {
  const s = useSession();
  if (!s.ready) return <Loading />;
  if (s.error && !s.mode) return <Screen title="Restaurant POS"><T color="#FF4757">{s.error}</T><Muted>Restart the app. If this continues, contact support.</Muted></Screen>;
  if (!s.mode) return <Setup />;
  if (s.mode === 'parent') return <LicenseGate><ParentLicenseBridge /><Home /></LicenseGate>;
  return <ChildGate><Home /></ChildGate>;
}
