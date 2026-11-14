import { DatabaseConnection, QueryResult } from './connection';

export class NodeSqliteDriver implements DatabaseConnection {
  private db: any;
  private inTransaction = false;

  constructor(filename = ':memory:') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(filename);
      this.db.exec('PRAGMA foreign_keys = ON;');
    } catch (err: any) {
      throw new Error(`NodeSqliteDriver unavailable: ${err?.message ?? 'node:sqlite not found'}`);
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params as any[]));
    return {
      rowsAffected: Number(result.changes),
      insertId: Number(result.lastInsertRowid)
    };
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...(params as any[]));
    return rows as T[];
  }

  async execRaw(multiStatementSql: string): Promise<void> {
    this.db.exec(multiStatementSql);
  }

  async transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return fn(this);
    }

    this.inTransaction = true;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}
