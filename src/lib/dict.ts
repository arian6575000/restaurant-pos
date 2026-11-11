// UI strings shared by the kit, lock screen, scanner and license gate. App is English-only; screens use plain English text.
export const D: Record<string, string> = {
  loading: 'Loading…', cancel: 'Cancel', confirm: 'Confirm', areYouSure: 'Are you sure?', done: 'Done', enable: 'Enable',
  search: 'Search', noMatches: 'No matches', select: 'Select…', pickDate: 'Select date', copied: 'Copied',
  enterPin: 'Enter PIN', wrongPin: 'Wrong PIN', pin4: 'PIN must be 4 digits', pinWait: 'Too many attempts. Try again in {n}s',
  forgotPin: 'Forgot PIN?', forgotPinMsg: 'The only way to reset is to erase all data on this device. A Child device can re-pair afterwards.',
  eraseEverything: 'Erase everything', useBiometric: 'Use fingerprint / face',
  cameraDenied: 'Camera permission is required to scan the pairing QR code.', scanHint: 'Point the camera at the Parent device QR code',
  licTitle: 'Activation required', licDeviceId: 'Your Device ID', licHint: 'Send this Device ID to the software provider to get your license key.',
  licPaste: 'License key', licPasteBtn: 'Paste', licCopy: 'Copy', licShare: 'Share', licActivate: 'Activate', licActivated: 'License activated',
  licExpiring: 'License expires in {n} day(s). Contact your provider to renew.',
  licFormat: 'License format is wrong', licSignature: 'Invalid license (signature)', licProject: 'This license is not for Restaurant POS',
  licMachine: 'This license is for a different device', licExpired: 'License has expired', licClock: 'Device date/time is wrong, please correct it',
  licConfig: 'App build is missing its license key. Contact the developer.',
};
