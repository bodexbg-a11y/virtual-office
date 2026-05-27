const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'bodex.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Compatibility wrapper to match pg-style { rows } API
module.exports = {
  query(sql, params = []) {
    const stmt = sql.trim();
    if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(stmt)) {
      try {
        const prepared = db.prepare(sql);
        const info = prepared.run(...params);
        // For INSERT...RETURNING
        if (/RETURNING/i.test(sql)) {
          // SQLite doesn't support RETURNING natively in older versions
          // Simulate by getting last insert row
          const table = sql.match(/(?:INSERT INTO|UPDATE)\s+(\w+)/i)?.[1];
          if (table && info.lastInsertRowid) {
            const row = db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`).get(info.lastInsertRowid);
            return { rows: row ? [row] : [], rowCount: info.changes };
          }
        }
        return { rows: [], rowCount: info.changes };
      } catch (err) {
        // Handle "no such table" gracefully during init
        if (err.message.includes('no such table')) return { rows: [], rowCount: 0 };
        throw err;
      }
    } else {
      try {
        const rows = db.prepare(sql).all(...params);
        return { rows };
      } catch (err) {
        if (err.message.includes('no such table')) return { rows: [] };
        throw err;
      }
    }
  },
  raw: db,
  close() { db.close(); }
};
