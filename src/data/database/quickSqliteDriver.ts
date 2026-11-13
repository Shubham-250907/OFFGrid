import { DatabaseConnection, QueryResult } from './connection';

/**
 * Driver adapter for react-native-quick-sqlite in production Android runtime.
 */
export class QuickSqliteDriver implements DatabaseConnection {
  private db: any;

  constructor(dbInstance: any) {
    this.db = dbInstance;
    this.db.execute('PRAGMA foreign_keys = ON;');
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const result = this.db.execute(sql, params);
    return {
      rowsAffected: result.rowsAffected ?? 0,
      insertId: result.insertId
    };
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = this.db.execute(sql, params);
    return (result.rows?._array ?? []) as T[];
  }

  async execRaw(multiStatementSql: string): Promise<void> {
    this.db.execute(multiStatementSql);
  }

  async transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx: any) => {
      const txAdapter: DatabaseConnection = {
        execute: async (sql, params = []) => {
          const res = tx.execute(sql, params);
          return { rowsAffected: res.rowsAffected ?? 0, insertId: res.insertId };
        },
        query: async <R>(sql: string, params: unknown[] = []) => {
          const res = tx.execute(sql, params);
          return (res.rows?._array ?? []) as R[];
        },
        execRaw: async (sql) => {
          tx.execute(sql);
        },
        transaction: async (innerFn) => innerFn(txAdapter),
        close: async () => {}
      };
      return fn(txAdapter);
    });
  }

  async close(): Promise<void> {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}
