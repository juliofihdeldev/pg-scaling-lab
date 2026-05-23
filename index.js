const express = require("express");
const { writePool, readPool, ensureSchema, dbStatus } = require("./db");
const partitions = require("./partitions");

const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/db/status", async (_req, res, next) => {
  try {
    const [write, read] = await Promise.all([
      dbStatus(writePool),
      dbStatus(readPool),
    ]);
    res.json({ write, read });
  } catch (err) {
    next(err);
  }
});

app.get("/employees", async (_req, res, next) => {
  try {
    const [result, totalResult] = await Promise.all([
      readPool.query(
        "SELECT id, name, department, salary FROM employees ORDER BY id DESC LIMIT 50"
      ),
      readPool.query("SELECT COUNT(*)::int AS total FROM employees"),
    ]);
    res.json({
      source: "read-pool",
      count: result.rowCount,
      total: totalResult.rows[0].total,
      rows: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

const BULK_AMOUNTS = {
  "10k": 10_000,
  "100k": 100_000,
  "1m": 1_000_000,
};

app.post("/employees/bulk", async (req, res, next) => {
  const amount = String(req.body.amount || "").toLowerCase();
  const count = BULK_AMOUNTS[amount];

  if (!count) {
    return res.status(400).json({ error: "amount must be one of: 10k, 100k, 1m" });
  }

  const start = Date.now();

  try {
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

    res.status(201).json({
      source: "write-pool",
      amount,
      inserted: result.rowCount,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/employees/:id", async (req, res, next) => {
  try {
    const result = await readPool.query(
      "SELECT id, name, department, salary FROM employees WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }
    res.json({ source: "read-pool", row: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.post("/employees", async (req, res, next) => {
  const { name, department, salary } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const result = await writePool.query(
      `INSERT INTO employees (name, department, salary)
       VALUES ($1, $2, $3)
       RETURNING id, name, department, salary`,
      [name, department || null, salary ?? null]
    );
    res.status(201).json({ source: "write-pool", row: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get("/orders/summary", async (_req, res, next) => {
  try {
    const result = await readPool.query(`
      SELECT tableoid::regclass AS partition_name, COUNT(*)::int AS row_count
      FROM orders
      GROUP BY tableoid
      ORDER BY partition_name
    `);
    res.json({ source: "read-pool", partitions: result.rows });
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(404).json({
        error: "orders table not found — use PARTITIONS panel to run setup",
      });
    }
    next(err);
  }
});

app.post("/partitions/setup", async (_req, res, next) => {
  try {
    const result = await partitions.setupPartitions(writePool);
    res.status(201).json({ source: "write-pool", ...result });
  } catch (err) {
    next(err);
  }
});

app.get("/partitions", async (_req, res, next) => {
  try {
    const list = await partitions.listPartitions(readPool);
    res.json({ source: "read-pool", partitions: list });
  } catch (err) {
    if (err.code === "42P01") {
      return res.json({ source: "read-pool", partitions: [], setup_required: true });
    }
    next(err);
  }
});

app.post("/partitions/seed", async (req, res, next) => {
  try {
    const amount = String(req.body.amount || "100k").toLowerCase();
    const result = await partitions.seedOrders(writePool, amount);
    res.status(201).json({ source: "write-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.post("/partitions/detach", async (req, res, next) => {
  try {
    const name = req.body.partition;
    if (!name) {
      return res.status(400).json({ error: "partition is required" });
    }
    const result = await partitions.detachPartition(writePool, name);
    res.json({ source: "write-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.get("/partitions/query/:name", async (req, res, next) => {
  try {
    const result = await partitions.queryPartition(readPool, req.params.name);
    res.json({ source: "read-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.post("/orders", async (req, res, next) => {
  const { customer_id, order_date, amount, status } = req.body;
  if (!customer_id || !order_date || amount == null) {
    return res.status(400).json({
      error: "customer_id, order_date, and amount are required",
    });
  }

  try {
    const result = await writePool.query(
      `INSERT INTO orders (customer_id, order_date, amount, status)
       VALUES ($1, $2, $3, $4)
       RETURNING order_id, customer_id, order_date, amount, status`,
      [customer_id, order_date, amount, status || "pending"]
    );
    res.status(201).json({ source: "write-pool", row: result.rows[0] });
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(404).json({
        error: "orders table not found — run the partitioning section of sql.sql on the primary first",
      });
    }
    next(err);
  }
});

app.get("/test/replication", async (_req, res, next) => {
  const marker = `replication-test-${Date.now()}`;

  try {
    await writePool.query(
      "INSERT INTO employees (name, department, salary) VALUES ($1, $2, $3)",
      [marker, "Test", 1]
    );

    const [fromWrite, fromRead] = await Promise.all([
      writePool.query(
        "SELECT id, name FROM employees WHERE name = $1",
        [marker]
      ),
      readPool.query(
        "SELECT id, name FROM employees WHERE name = $1",
        [marker]
      ),
    ]);

    res.json({
      marker,
      writePool: { found: fromWrite.rowCount > 0, row: fromWrite.rows[0] ?? null },
      readPool: { found: fromRead.rowCount > 0, row: fromRead.rows[0] ?? null },
      replicated: fromRead.rowCount > 0,
      note: fromRead.rowCount === 0
        ? "Row not yet visible on read pool — replica lag is normal; retry in a moment"
        : "Replication is working",
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

async function start() {
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    console.log(`Write pool → ${process.env.WRITE_DB_HOST || "localhost"}:${process.env.WRITE_DB_PORT || 5433}`);
    console.log(`Read pool  → ${process.env.READ_DB_HOST || "localhost"}:${process.env.READ_DB_PORT || 5436}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
