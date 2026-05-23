const { Pool } = require("pg");

const dbConfig = {
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "scalinglab",
};

const writePool = new Pool({
  ...dbConfig,
  host: process.env.WRITE_DB_HOST || "localhost",
  port: Number(process.env.WRITE_DB_PORT || 5433),
  max: 10,
});

const readPool = new Pool({
  ...dbConfig,
  host: process.env.READ_DB_HOST || "localhost",
  port: Number(process.env.READ_DB_PORT || 5436),
  max: 10,
});

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

module.exports = { writePool, readPool, ensureSchema, dbStatus };
