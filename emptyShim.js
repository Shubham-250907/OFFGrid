// Pure in-memory SQLite shim for React Native runtime when bundling without native C++ NDK
class InMemoryDatabaseSync {
  constructor() {
    this.tables = new Map(); // tableName -> Array of row objects
    this.inTransaction = false;
  }

  exec(sql) {
    if (!sql || typeof sql !== 'string') return;
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      const upper = stmt.toUpperCase();
      if (upper.startsWith('CREATE TABLE')) {
        const match = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
        if (match && match[1]) {
          const tableName = match[1].toLowerCase();
          if (!this.tables.has(tableName)) {
            this.tables.set(tableName, []);
          }
        }
      } else if (upper.startsWith('PRAGMA') || upper.startsWith('CREATE INDEX') || upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
        // Safe no-op in memory
      }
    }
  }

  close() {}

  prepare(sql) {
    const db = this;
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    return {
      run(...params) {
        return db._executeRun(trimmed, upper, params);
      },
      all(...params) {
        return db._executeQuery(trimmed, upper, params);
      }
    };
  }

  _executeRun(sql, upper, params) {
    // 1. INSERT INTO <table> (...) VALUES (...) [ON CONFLICT ... ]
    if (upper.startsWith('INSERT INTO') || upper.startsWith('INSERT OR REPLACE INTO')) {
      const match = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+INTO|INTO)\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const colNames = match[2].split(',').map(c => c.trim());
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
        const table = this.tables.get(tableName);

        const newRow = {};
        for (let i = 0; i < colNames.length; i++) {
          newRow[colNames[i]] = params[i] !== undefined ? params[i] : null;
        }

        // Handle ON CONFLICT(<pk>) DO UPDATE / DO NOTHING
        const conflictMatch = sql.match(/ON\s+CONFLICT\s*\(([^)]+)\)\s*(DO\s+NOTHING|DO\s+UPDATE\s+SET\s+([^;]+))?/i);
        let replaced = false;
        if (conflictMatch) {
          const pkCol = conflictMatch[1].trim();
          const action = (conflictMatch[2] || '').toUpperCase();
          const existingIdx = table.findIndex(r => r[pkCol] === newRow[pkCol]);
          if (existingIdx !== -1) {
            if (action.includes('DO NOTHING')) {
              return { changes: 0, lastInsertRowid: existingIdx + 1 };
            } else if (action.includes('DO UPDATE')) {
              table[existingIdx] = { ...table[existingIdx], ...newRow };
              return { changes: 1, lastInsertRowid: existingIdx + 1 };
            }
          }
        }

        table.push(newRow);
        return { changes: 1, lastInsertRowid: table.length };
      }
    }

    // 2. UPDATE <table> SET col1 = ?, ... WHERE ...
    if (upper.startsWith('UPDATE')) {
      const match = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const setClause = match[2];
        const whereClause = match[3];
        const table = this.tables.get(tableName) || [];

        // Simple param mapping
        let paramIdx = 0;
        const assignments = setClause.split(',').map(a => {
          const parts = a.split('=').map(p => p.trim());
          const col = parts[0];
          const valExpr = parts[1];
          let val = null;
          if (valExpr === '?') {
            val = params[paramIdx++];
          } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
            val = valExpr.slice(1, -1);
          } else if (!isNaN(Number(valExpr))) {
            val = Number(valExpr);
          }
          return { col, val };
        });

        let updated = 0;
        for (let i = 0; i < table.length; i++) {
          const row = table[i];
          if (this._matchesWhere(row, whereClause, params, paramIdx)) {
            for (const { col, val } of assignments) {
              row[col] = val;
            }
            updated++;
          }
        }
        return { changes: updated, lastInsertRowid: 0 };
      }
    }

    // 3. DELETE FROM <table> WHERE ...
    if (upper.startsWith('DELETE FROM')) {
      const match = sql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const whereClause = match[2];
        const table = this.tables.get(tableName) || [];
        const initialLen = table.length;

        const remaining = table.filter(row => !this._matchesWhere(row, whereClause, params, 0));
        this.tables.set(tableName, remaining);
        return { changes: initialLen - remaining.length, lastInsertRowid: 0 };
      }
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  _executeQuery(sql, upper, params) {
    const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(.+?))?$/i);
    if (!match) {
      return [];
    }

    const selectCols = match[1].trim();
    const tableName = match[2].toLowerCase();
    const whereClause = match[3];
    const orderByClause = match[4];
    const limitClause = match[5];

    let rows = [...(this.tables.get(tableName) || [])];

    // Filter by WHERE
    if (whereClause) {
      rows = rows.filter(row => this._matchesWhere(row, whereClause, params, 0));
    }

    // ORDER BY
    if (orderByClause) {
      const orderParts = orderByClause.split(',').map(p => p.trim());
      for (const part of orderParts) {
        const [col, dir] = part.split(/\s+/);
        const isDesc = (dir || '').toUpperCase() === 'DESC';
        rows.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          return isDesc ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
        });
      }
    }

    // LIMIT
    if (limitClause) {
      const limitVal = parseInt(limitClause, 10);
      if (!isNaN(limitVal)) {
        rows = rows.slice(0, limitVal);
      }
    }

    // SELECT projections (support count(*) or columns)
    if (selectCols === '*') {
      return rows.map(r => ({ ...r }));
    } else if (selectCols.toUpperCase().includes('COUNT(*)')) {
      const asMatch = selectCols.match(/COUNT\(\*\)\s+AS\s+([a-zA-Z0-9_]+)/i);
      const key = asMatch ? asMatch[1] : 'count';
      return [{ [key]: rows.length }];
    } else {
      const cols = selectCols.split(',').map(c => c.trim().split(/\s+AS\s+/i)[0].trim());
      return rows.map(r => {
        const projected = {};
        for (const c of cols) {
          projected[c] = r[c];
        }
        return projected;
      });
    }
  }

  _matchesWhere(row, whereClause, params, paramOffset = 0) {
    if (!whereClause) return true;
    // Check simple conditions like `col = ?`, `col = 'VALUE'`, `col > ?`
    const conds = whereClause.split(/\s+AND\s+/i);
    let pIdx = paramOffset;

    for (const cond of conds) {
      const eqMatch = cond.match(/([a-zA-Z0-9_.]+)\s*(=|>|<|>=|<=)\s*(\?|'[^']*'|[0-9]+)/);
      if (eqMatch) {
        const colRaw = eqMatch[1].split('.').pop();
        const op = eqMatch[2];
        const valToken = eqMatch[3];

        let targetVal = null;
        if (valToken === '?') {
          targetVal = params[pIdx++];
        } else if (valToken.startsWith("'")) {
          targetVal = valToken.slice(1, -1);
        } else {
          targetVal = Number(valToken);
        }

        const rowVal = row[colRaw];
        if (op === '=') {
          if (rowVal != targetVal) return false;
        } else if (op === '>') {
          if (!(rowVal > targetVal)) return false;
        } else if (op === '<') {
          if (!(rowVal < targetVal)) return false;
        } else if (op === '>=') {
          if (!(rowVal >= targetVal)) return false;
        } else if (op === '<=') {
          if (!(rowVal <= targetVal)) return false;
        }
      }
    }
    return true;
  }
}

module.exports = {
  DatabaseSync: InMemoryDatabaseSync
};
