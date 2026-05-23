const { writePool } = require("./pools");

async function ensureSchema() {
  await writePool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      department VARCHAR(50),
      salary NUMERIC(10, 2)
    )
  `);
}

async function dbStatus(pool) {
  const result = await pool.query(`
    SELECT
      inet_server_addr()::text AS server_ip,
      inet_server_port() AS server_port,
      pg_is_in_recovery() AS is_replica,
      current_database() AS database
  `);
  return result.rows[0];
}

module.exports = { ensureSchema, dbStatus };
