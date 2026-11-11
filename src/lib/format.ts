import type { Lang } from './i18n';
import { daysFromToday, parseYmd } from './dates';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const Fmt = {
  currency: 'Rs',
  money(amount: number | string | null | undefined): string {
    const n = Math.round(Number(amount) || 0);
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${n < 0 ? '-' : ''}${Fmt.currency} ${s}`;
  },
  /** Accepts 'YYYY-MM-DD' or a timestamp. */
  date(v: string | number | null | undefined, _lang: Lang = 'en', short = false): string {
    if (!v) return '—';
    const d = typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? parseYmd(v) : new Date(v);
    if (isNaN(d.getTime())) return '—';
    const names = MONTHS_EN;
    const mn = short ? names[d.getMonth()].slice(0, 3) : names[d.getMonth()];
    return `${d.getDate()} ${mn} ${d.getFullYear()}`;
  },
  monthYear(y: number, m: number, _lang: Lang = 'en') {
    return `${MONTHS_EN[m]} ${y}`;
  },
  initials(name?: string) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0]?.toUpperCase() || '').join('');
  },
  daysFromToday,
};

/** Money is stored as integer minor units (cents/paisa). */
export function moneyMinor(minor: number | null | undefined): string {
  const n = Math.round(Number(minor) || 0);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${Fmt.currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}
/** Parses a user-typed amount like "450" or "450.5" into minor units; null when invalid. */
export function parseMinor(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}
