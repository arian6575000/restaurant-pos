import { Platform } from 'react-native';

export const C = {
  bg: '#eef1f8',
  // Cards must be OPAQUE: on Android a translucent fill + elevation lets the elevation shadow show through as a grey box.
  card: '#FBFCFF',
  cardBorder: '#FFFFFF',
  surface: '#FFFFFF',
  line: 'rgba(20,22,31,0.08)',
  ink: '#14161F',
  soft: '#4B4F5E',
  faint: '#8A8FA0',
  primary: '#3E6BFF',
  primary2: '#7A5CFA',
  danger: '#FF4757',
  success: '#14C48B',
  warning: '#FF9F43',
  white: '#FFFFFF',
};

export const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  open: { fg: '#3E6BFF', bg: 'rgba(62,107,255,0.12)' },
  sent_to_kitchen: { fg: '#FF9F43', bg: 'rgba(255,159,67,0.15)' },
  in_preparation: { fg: '#7A5CFA', bg: 'rgba(122,92,250,0.13)' },
  ready: { fg: '#14C48B', bg: 'rgba(20,196,139,0.13)' },
  served: { fg: '#0E7490', bg: 'rgba(14,116,144,0.12)' },
  closed: { fg: '#14161F', bg: 'rgba(20,22,31,0.08)' },
  cancelled: { fg: '#FF4757', bg: 'rgba(255,71,87,0.12)' },
};

export const TONES = {
  blue: { bg: 'rgba(62,107,255,0.14)', fg: C.primary },
  violet: { bg: 'rgba(122,92,250,0.14)', fg: C.primary2 },
  green: { bg: 'rgba(20,196,139,0.14)', fg: C.success },
  orange: { bg: 'rgba(255,159,67,0.14)', fg: C.warning },
  red: { bg: 'rgba(255,71,87,0.12)', fg: C.danger },
};

export const FONT_UR = 'NotoNastaliqUrdu_400Regular';
export const FONT_UR_BOLD = 'NotoNastaliqUrdu_700Bold';

// Soft shadow. Only ever put it on views with an opaque background.
export const shadow = Platform.select({
  android: { shadowColor: '#1F2850', elevation: 2 },
  default: { shadowColor: '#1F2850', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
}) as { shadowColor: string; elevation?: number; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number } };
export const shadowSm = Platform.select({
  android: { shadowColor: '#1F2850', elevation: 0 },
  default: { shadowColor: '#1F2850', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
}) as typeof shadow;
