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

module.exports = {
  async query(sql, params = []) {
    const pgSql = convertSqliteParams(sql);
    const result = await pool.query(pgSql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  },

  raw: {
    async exec(sql) {
      return pool.query(sql);
    },
  },

  async close() {
    await pool.end();
  },
};
