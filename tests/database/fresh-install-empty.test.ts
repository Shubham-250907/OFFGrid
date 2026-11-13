import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Fresh Install Database State', () => {
  it('confirms migration file has no pre-populated records', () => {
    const migrationPath = path.resolve(__dirname, '../../src/data/database/migrations/001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const insertMatches = sql.match(/INSERT\s+INTO/gi) || [];
    expect(insertMatches.length).toBe(0);
  });
});
