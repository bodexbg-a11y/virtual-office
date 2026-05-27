const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

function convertSqliteParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  const pgSql = convertSqliteParams(sql);
  const result = await pool.query(pgSql, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount,
  };
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  const pgSql = convertSqliteParams(sql);
  const result = await pool.query(pgSql, params);
  return {
    changes: result.rowCount || 0,
    lastInsertRowid: result.rows?.[0]?.id || null,
    rows: result.rows || [],
  };
}

async function exec(sql) {
  return pool.query(sql);
}

module.exports = {
  query,
  get,
  all,
  run,
  exec,

  raw: {
    exec,
    prepare(sql) {
      return {
        get: (...params) => get(sql, params),
        all: (...params) => all(sql, params),
        run: (...params) => run(sql, params),
      };
    },
  },

  async close() {
    await pool.end();
  },
};
