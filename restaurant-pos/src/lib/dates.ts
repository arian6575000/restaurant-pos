const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());

export function addDays(n: number, from?: string): string {
  const d = from ? parseYmd(from) : new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function daysFromToday(s: string): number | null {
  if (!s || !/^\d{4}-\d\d-\d\d$/.test(s)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((parseYmd(s).getTime() - now.getTime()) / 86400000);
}
export function monthRange(y: number, m: number): [string, string] {
  return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-31`];
}
