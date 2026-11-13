import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';

describe('Fresh Install Database State', () => {
  let db: NodeSqliteDriver;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('guarantees that a fresh database has exactly zero operational records', async () => {
    const operationalTables = [
      'events',
      'incidents',
      'votes',
      'sos_requests',
      'triage_requests',
      'shelters',
      'shelter_updates',
      'chat_messages',
      'pending_dependencies',
      'relay_queue',
      'rate_limits'
    ];

    for (const table of operationalTables) {
      const rows = await db.query<{ count: number }>(`SELECT count(*) as count FROM ${table};`);
      expect(rows[0]?.count).toBe(0);
    }
  });
});
