export interface QueryResult {
  rowsAffected: number;
  insertId?: number;
}

export interface DatabaseConnection {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execRaw(multiStatementSql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private connection: DatabaseConnection | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public setConnection(conn: DatabaseConnection): void {
    this.connection = conn;
  }

  public getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new Error('Database connection has not been initialized');
    }
    return this.connection;
  }

  public isInitialized(): boolean {
    return this.connection !== null;
  }
}
