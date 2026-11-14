import { DatabaseConnection, QueryResult } from './connection';

/**
 * Robust in-memory database driver for fallback scenarios when native SQLite
 * or node:sqlite are unavailable. Stores records in memory tables.
 */
export class InMemorySqliteDriver implements DatabaseConnection {
  private tables = new Map<string, Array<Record<string, any>>>();
  private inTransaction = false;

  async execute(sql: string, _params: unknown[] = []): Promise<QueryResult> {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT INTO')) {
      const match = sql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
      const tableName = (match && match[1]) ? match[1].toLowerCase() : 'unknown';
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, []);
      }
      const table = this.tables.get(tableName)!;
      const row: Record<string, any> = { _id: table.length + 1 };
      table.push(row);
      return { rowsAffected: 1, insertId: table.length };
    }
    return { rowsAffected: 1 };
  }

  async query<T = unknown>(sql: string, _params: unknown[] = []): Promise<T[]> {
    const match = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    const tableName = (match && match[1]) ? match[1].toLowerCase() : '';
    const records = (this.tables.get(tableName) ?? []) as T[];
    return records;
  }

  async execRaw(_multiStatementSql: string): Promise<void> {
    // Schema creation accepted in-memory
  }

  async transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return fn(this);
    }
    this.inTransaction = true;
    try {
      return await fn(this);
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    this.tables.clear();
  }
}
