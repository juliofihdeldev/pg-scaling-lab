const { readPool, writePool } = require("../db/pools");
const cache = require("../cache/redis");

const BULK_AMOUNTS = {
  "10k": 10_000,
  "100k": 100_000,
  "1m": 1_000_000,
};

async function fetchFromDb() {
  const [result, totalResult] = await Promise.all([
    readPool.query(
      "SELECT id, name, department, salary FROM employees ORDER BY id DESC LIMIT 50"
    ),
    readPool.query("SELECT COUNT(*)::int AS total FROM employees"),
  ]);
  return {
    source: "read-pool",
    count: result.rowCount,
    total: totalResult.rows[0].total,
    rows: result.rows,
  };
}

async function list(bypass = false) {
  if (bypass || !cache.isEnabled()) {
    const data = await fetchFromDb();
    return { ...data, cache: "bypass" };
  }

  const { data, cache: cacheResult } = await cache.getOrFetch(
    cache.KEYS.employeesList,
    fetchFromDb
  );
  return { ...data, cache: cacheResult };
}

async function getById(id) {
  const result = await readPool.query(
    "SELECT id, name, department, salary FROM employees WHERE id = $1",
    [id]
  );
  if (result.rowCount === 0) {
    return null;
  }
  return { source: "read-pool", row: result.rows[0] };
}

async function create({ name, department, salary }) {
  const result = await writePool.query(
    `INSERT INTO employees (name, department, salary)
     VALUES ($1, $2, $3)
     RETURNING id, name, department, salary`,
    [name, department || null, salary ?? null]
  );
  await cache.invalidateEmployees();
  return {
    source: "write-pool",
    row: result.rows[0],
    cache_invalidated: true,
  };
}

async function bulkCreate(amountKey) {
  const count = BULK_AMOUNTS[amountKey];
  if (!count) {
    throw Object.assign(new Error("amount must be one of: 10k, 100k, 1m"), {
      status: 400,
    });
  }

  const start = Date.now();
  const result = await writePool.query(
    `INSERT INTO employees (name, department, salary)
     SELECT
       'Employee_' || i,
       CASE (i % 4)
         WHEN 0 THEN 'Engineering'
         WHEN 1 THEN 'Marketing'
         WHEN 2 THEN 'Sales'
         WHEN 3 THEN 'Support'
       END,
       40000 + (random() * 60000)::NUMERIC(10, 2)
     FROM generate_series(1, $1) AS i`,
    [count]
  );

  await cache.invalidateEmployees();

  return {
    source: "write-pool",
    amount: amountKey,
    inserted: result.rowCount,
    durationMs: Date.now() - start,
    cache_invalidated: true,
  };
}

async function ordersSummary() {
  const result = await readPool.query(`
    SELECT tableoid::regclass AS partition_name, COUNT(*)::int AS row_count
    FROM orders
    GROUP BY tableoid
    ORDER BY partition_name
  `);
  return { source: "read-pool", partitions: result.rows };
}

async function createOrder({ customer_id, order_date, amount, status }) {
  const result = await writePool.query(
    `INSERT INTO orders (customer_id, order_date, amount, status)
     VALUES ($1, $2, $3, $4)
     RETURNING order_id, customer_id, order_date, amount, status`,
    [customer_id, order_date, amount, status || "pending"]
  );
  return { source: "write-pool", row: result.rows[0] };
}

module.exports = {
  list,
  getById,
  create,
  bulkCreate,
  ordersSummary,
  createOrder,
  fetchFromDb,
};
