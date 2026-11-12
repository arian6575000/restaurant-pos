import * as SQLite from 'expo-sqlite';
import { fromExpo } from '../db/expoAdapter';
import { migrate, type Db } from '../db/schema';

const NAME = 'restaurantpos.db';
let raw: SQLite.SQLiteDatabase | null = null;
let opening: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!opening) opening = (async () => {
    raw = await SQLite.openDatabaseAsync(NAME);
    await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const db = fromExpo(raw); await migrate(db); return db;
  })();
  return opening;
}
/** Closes and deletes the database file (used by "Erase everything"). */
export async function destroyDb(): Promise<void> {
  if (opening) { try { await opening; } catch { /* ignore */ } }
  try { await raw?.closeAsync(); } catch { /* ignore */ }
  raw = null; opening = null;
  await SQLite.deleteDatabaseAsync(NAME);
}
