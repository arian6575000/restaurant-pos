import { Platform } from 'react-native';

export const C = {
  bg: '#F7F5F2',
  // Cards must be OPAQUE: on Android a translucent fill + elevation lets the elevation shadow show through as a grey box.
  card: '#FFFFFF',
  cardBorder: '#E9E4DD',
  surface: '#FFFFFF',
  line: '#E9E4DD',
  ink: '#1C1A17',
  soft: '#5F5A53',
  faint: '#8E8880',
  primary: '#F25C1F',
  primary2: '#FF9A4D',
  danger: '#E5383B',
  success: '#12A150',
  warning: '#D98E00',
  white: '#FFFFFF',
};

export const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  open: { fg: '#2F6BFF', bg: '#E7EEFF' },
  sent_to_kitchen: { fg: '#D98E00', bg: '#FFF4D6' },
  in_preparation: { fg: '#7C5CFA', bg: '#EFEAFF' },
  ready: { fg: '#12A150', bg: '#E3F6EA' },
  served: { fg: '#0E7490', bg: '#DDF3F8' },
  closed: { fg: '#5F5A53', bg: '#ECE8E2' },
  cancelled: { fg: '#E5383B', bg: '#FDE9E9' },
};

export const TONES = {
  blue: { bg: '#E7EEFF', fg: '#2F6BFF' },
  violet: { bg: '#EFEAFF', fg: '#7C5CFA' },
  green: { bg: '#E3F6EA', fg: '#12A150' },
  orange: { bg: '#FFF0E6', fg: '#F25C1F' },
  red: { bg: '#FDE9E9', fg: '#E5383B' },
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
