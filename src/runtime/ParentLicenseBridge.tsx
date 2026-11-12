import { useEffect } from 'react';
import { useLicense } from '../license/LicenseGate';
import { featureOn } from '../license/permissions';
import { licenseRef } from './session';

/** Publishes the Parent's license state to the network layer. Children never see a license, only the Parent's heartbeat. */
export function ParentLicenseBridge() {
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
