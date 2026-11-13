import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Duplicate Events Handling', () => {
  it('enforces UNIQUE(event_id, payload_hash) constraint in DDL', () => {
    const migrationPath = path.resolve(__dirname, '../../src/data/database/migrations/001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('UNIQUE(event_id, payload_hash)');
  });
});
