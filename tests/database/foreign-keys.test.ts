import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Foreign Keys Invariants', () => {
  it('enforces foreign key enforcement pragma and references in DDL', () => {
    const migrationPath = path.resolve(__dirname, '../../src/data/database/migrations/001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('PRAGMA foreign_keys = ON;');
    expect(sql).toContain('REFERENCES events(event_id)');
  });
});
