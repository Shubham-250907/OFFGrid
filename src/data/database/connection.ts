export interface DatabaseConnection {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; insertId?: number }>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: DatabaseConnection | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public setConnection(conn: DatabaseConnection): void {
    this.db = conn;
  }

  public getConnection(): DatabaseConnection {
    if (!this.db) {
      throw new Error('Database connection not initialized');
    }
    return this.db;
  }
}
