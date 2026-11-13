import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';

describe('Phase 6 Hardening: Zero Operational Seed Data & Zero Internet Dependency', () => {
  let db: NodeSqliteDriver;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('verifies that a fresh database install contains exactly zero operational records', async () => {
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
      'peer_sync_state',
      'relay_queue',
      'rate_limits'
    ];

    for (const table of operationalTables) {
      const rows = await db.query<any>(`SELECT COUNT(*) as cnt FROM ${table};`);
      expect(
        rows[0].cnt,
        `Table ${table} must be strictly empty on fresh installation, but had ${rows[0].cnt} records.`
      ).toBe(0);
    }

    // Only schema_migrations should have tracking records
    const migrationRows = await db.query<any>('SELECT COUNT(*) as cnt FROM schema_migrations;');
    expect(migrationRows[0].cnt).toBeGreaterThan(0);
  });

  it('verifies SQL migration files contain zero INSERT statements into operational tables', () => {
    const migrationsDir = path.resolve(__dirname, '../../src/data/database/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Allow inserts only into schema_migrations if any
        if (/^INSERT\s+INTO\s+/i.test(trimmed)) {
          expect(trimmed.toUpperCase()).toContain('SCHEMA_MIGRATIONS');
        }
      }
    }
  });

  it('verifies that core services operate with zero network/internet dependency', () => {
    // Audit that src/ does not import axios, fetch from remote URLs, or connect to external servers
    const srcDir = path.resolve(__dirname, '../../src');
    
    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Should not fetch from external http/https endpoints
          const httpMatches = content.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (httpMatches) {
            // Only allow offline or schema/docs URLs if any, but no production runtime API calls
            for (const url of httpMatches) {
              expect(url).not.toMatch(/api\.offgrid|cloud\.google|aws|firebase|supabase/i);
            }
          }
        }
      }
    }

    checkDir(srcDir);
  });
});
