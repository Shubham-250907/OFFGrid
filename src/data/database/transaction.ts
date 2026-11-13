import { DatabaseConnection } from './connection';

export async function withTransaction<T>(
  db: DatabaseConnection,
  operation: (tx: DatabaseConnection) => Promise<T>
): Promise<T> {
  return db.transaction(operation);
}
