// Ember design tokens. Light theme only. Brand: orange.
export const color = {
  bg: '#F7F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#FAF8F5',
  line: '#E9E4DD',
  lineStrong: '#D8D1C8',
  ink: '#1C1A17',
  soft: '#5F5A53',
  faint: '#8E8880',
  placeholder: '#B1ABA3',
  primary: '#F25C1F',
  primaryDark: '#D84A10',
  primaryTint: '#FFF0E6',
  primaryTint2: '#FFDCC8',
  onPrimary: '#FFFFFF',
  success: '#12A150', successTint: '#E3F6EA',
  warning: '#D98E00', warningTint: '#FFF4D6',
  danger: '#E5383B', dangerTint: '#FDE9E9',
  info: '#2F6BFF', infoTint: '#E7EEFF',
  violet: '#7C5CFA', violetTint: '#EFEAFF',
  scrim: 'rgba(24,18,12,0.45)',
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 26, pill: 999 } as const;
export const space = (n: number) => n * 4;

export const font = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold', extrabold: 'Inter_800ExtraBold',
} as const;
export type Weight = keyof typeof font;

export const typeScale = {
  display: { size: 32, weight: 'extrabold' as Weight, line: 38 },
  h1: { size: 24, weight: 'bold' as Weight, line: 30 },
  h2: { size: 20, weight: 'bold' as Weight, line: 26 },
  h3: { size: 17, weight: 'semibold' as Weight, line: 23 },
  body: { size: 15, weight: 'regular' as Weight, line: 21 },
  bodyM: { size: 15, weight: 'medium' as Weight, line: 21 },
  small: { size: 13, weight: 'regular' as Weight, line: 18 },
  smallM: { size: 13, weight: 'semibold' as Weight, line: 18 },
  tiny: { size: 11.5, weight: 'medium' as Weight, line: 15 },
  label: { size: 12, weight: 'semibold' as Weight, line: 16 },
} as const;
export type Variant = keyof typeof typeScale;

/** Status colours for orders, kitchen tickets and devices. */
export const status: Record<string, { fg: string; bg: string; label: string }> = {
  open: { fg: color.info, bg: color.infoTint, label: 'Open' },
  sent_to_kitchen: { fg: color.warning, bg: color.warningTint, label: 'In kitchen' },
  in_preparation: { fg: color.violet, bg: color.violetTint, label: 'Preparing' },
  ready: { fg: color.success, bg: color.successTint, label: 'Ready' },
  served: { fg: '#0E7490', bg: '#DDF3F8', label: 'Served' },
  closed: { fg: color.soft, bg: '#ECE8E2', label: 'Closed' },
  cancelled: { fg: color.danger, bg: color.dangerTint, label: 'Cancelled' },
  online: { fg: color.success, bg: color.successTint, label: 'Online' },
  offline: { fg: color.faint, bg: '#ECE8E2', label: 'Offline' },
  pending: { fg: color.warning, bg: color.warningTint, label: 'Pending' },
};
