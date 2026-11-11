// node:sqlite adapter that mimics the subset of the expo-sqlite async API used by the repo.
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db/schema';

export function createNodeDb(): Db {
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, params = []) {
      const r: any = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql, params = []) { return raw.prepare(sql).all(...params) as any[]; },
    async getFirstAsync(sql, params = []) { return ((raw.prepare(sql).get(...params)) as any) ?? null; },
    async withTransactionAsync(task) {
      if (depth) throw new Error('nested');
      depth++;
      raw.exec('BEGIN');
      try { await task(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
  };
}
