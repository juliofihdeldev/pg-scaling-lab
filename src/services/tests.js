const { writePool, readPool } = require("../db/pools");
const cache = require("../cache/redis");
const employees = require("./employees");

async function runReplicationTest() {
  const marker = `replication-test-${Date.now()}`;

  await writePool.query(
    "INSERT INTO employees (name, department, salary) VALUES ($1, $2, $3)",
    [marker, "Test", 1]
  );
  await cache.invalidateEmployees();

  const [fromWrite, fromRead] = await Promise.all([
    writePool.query("SELECT id, name FROM employees WHERE name = $1", [marker]),
    readPool.query("SELECT id, name FROM employees WHERE name = $1", [marker]),
  ]);

  return {
    marker,
    writePool: { found: fromWrite.rowCount > 0, row: fromWrite.rows[0] ?? null },
    readPool: { found: fromRead.rowCount > 0, row: fromRead.rows[0] ?? null },
    replicated: fromRead.rowCount > 0,
    cache_invalidated: true,
    note:
      fromRead.rowCount === 0
        ? "Row not yet visible on read pool — replica lag is normal; retry in a moment"
        : "Replication is working",
  };
}

async function runCacheTest() {
  await cache.delKeys(cache.KEYS.employeesList);

  const first = cache.isEnabled()
    ? await cache.getOrFetch(cache.KEYS.employeesList, employees.fetchFromDb)
    : { data: await employees.fetchFromDb(), cache: "bypass" };

  const second = cache.isEnabled()
    ? await cache.getOrFetch(cache.KEYS.employeesList, employees.fetchFromDb)
    : { data: await employees.fetchFromDb(), cache: "bypass" };

  const stats = await cache.getStats();

  return {
    first_request: { cache: first.cache, total: first.data.total },
    second_request: { cache: second.cache, total: second.data.total },
    expected: "first=miss, second=hit (when Redis enabled and TTL not expired)",
    stats: stats.app,
  };
}

module.exports = { runReplicationTest, runCacheTest };
