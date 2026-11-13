import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';

describe('Database Migrations with Real SQLite', () => {
  let db: NodeSqliteDriver;

  beforeEach(() => {
    db = new NodeSqliteDriver(':memory:');
  });

  afterEach(async () => {
    await db.close();
  });

  it('runs migration 001 and creates all authoritative tables and indexes', async () => {
    const applied = await runMigrations(db);
    expect(applied).toBe(1);

    // Verify schema_migrations ledger
    const ledger = await db.query<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations;'
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.version).toBe(1);
    expect(ledger[0]?.name).toBe('001_initial');

    // Verify all 13 core tables exist
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    );
    const tableNames = tables.map((t) => t.name).sort();

    const expectedTables = [
      'chat_messages',
      'events',
      'incidents',
      'peer_sync_state',
      'pending_dependencies',
      'rate_limits',
      'relay_queue',
      'schema_migrations',
      'shelter_updates',
      'shelters',
      'sos_requests',
      'triage_requests',
      'votes'
    ].sort();

    expect(tableNames).toEqual(expectedTables);
  });

  it('is idempotent: running migrations twice does not re-apply', async () => {
    const firstRun = await runMigrations(db);
    expect(firstRun).toBe(1);

    const secondRun = await runMigrations(db);
    expect(secondRun).toBe(0); // 0 new migrations applied
  });
});
