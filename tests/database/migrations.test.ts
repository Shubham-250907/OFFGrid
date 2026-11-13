import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Migrations', () => {
  it('001_initial.sql exists and contains valid DDL', () => {
    const migrationPath = path.resolve(__dirname, '../../src/data/database/migrations/001_initial.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS events');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS incidents');
    expect(sql).toContain('PRAGMA foreign_keys = ON;');
  });

  it('contains zero seed or insert statements for operational records', () => {
    const migrationPath = path.resolve(__dirname, '../../src/data/database/migrations/001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql.toUpperCase()).not.toContain('INSERT INTO INCIDENTS');
    expect(sql.toUpperCase()).not.toContain('INSERT INTO SHELTERS');
    expect(sql.toUpperCase()).not.toContain('INSERT INTO SOS_REQUESTS');
  });
});
