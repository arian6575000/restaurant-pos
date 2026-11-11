import { D } from './dict';

export type Lang = 'en';
export function translate(key: string, _lang: Lang = 'en'): string { return D[key] ?? key; }
export type TFn = (key: string, lang?: Lang) => string;
