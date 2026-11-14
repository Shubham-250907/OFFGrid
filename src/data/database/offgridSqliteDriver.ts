import { NativeModules } from 'react-native';
import { DatabaseConnection, QueryResult } from './connection';

const { OffgridSqlite } = NativeModules;

export class OffgridSqliteDriver implements DatabaseConnection {
  private inTransaction = false;

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    if (!OffgridSqlite) {
      throw new Error('OffgridSqlite native module is not available');
    }
    const cleanParams = params.map((p) => (p === undefined ? null : p));
    const res = await OffgridSqlite.execute(sql, cleanParams);
    return {
      rowsAffected: res?.rowsAffected ?? 0,
      insertId: res?.insertId
    };
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!OffgridSqlite) {
      throw new Error('OffgridSqlite native module is not available');
    }
    const cleanParams = params.map((p) => (p === undefined ? null : p));
    const rows = await OffgridSqlite.query(sql, cleanParams);
    return (rows ?? []) as T[];
  }

  async execRaw(multiStatementSql: string): Promise<void> {
    if (!OffgridSqlite) {
      throw new Error('OffgridSqlite native module is not available');
    }
    await OffgridSqlite.execRaw(multiStatementSql);
  }

  async transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T> {
    if (!OffgridSqlite) {
      throw new Error('OffgridSqlite native module is not available');
    }
    if (this.inTransaction) {
      return fn(this);
    }

    this.inTransaction = true;
    await OffgridSqlite.beginTransaction();
    try {
      const result = await fn(this);
      await OffgridSqlite.commitTransaction();
      return result;
    } catch (err) {
      try {
        await OffgridSqlite.rollbackTransaction();
      } catch {}
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (OffgridSqlite && typeof OffgridSqlite.close === 'function') {
      try {
        await OffgridSqlite.close();
      } catch {}
    }
  }
}
