// Responsive layout. Every screen adapts to the window, not to a device type: phones (portrait / landscape), small and large tablets.
import { useWindowDimensions } from 'react-native';

export type SizeClass = 'compact' | 'medium' | 'expanded';
export interface Layout {
  width: number; height: number; cls: SizeClass; landscape: boolean;
  /** side navigation rail + two-pane screens */
  wide: boolean;
  /** horizontal page padding */
  gutter: number;
  /** content max width for reading-style screens (lists, forms) */
  maxContent: number;
  /** number of columns for a grid of cards at a given minimum card width */
  columns: (minItemWidth: number, available?: number, gap?: number) => number;
}

export function sizeClass(width: number): SizeClass { return width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded'; }

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const cls = sizeClass(width);
  const gutter = cls === 'compact' ? 16 : cls === 'medium' ? 24 : 28;
  return {
    width, height, cls, landscape: width > height, wide: cls === 'expanded', gutter, maxContent: 920,
    columns: (min, available = width - gutter * 2, gap = 12) => Math.max(1, Math.floor((available + gap) / (min + gap))),
  };
}
