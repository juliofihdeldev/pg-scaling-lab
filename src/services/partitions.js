const MONTHLY_PARTITIONS = [
  ["orders_2025_01", "2025-01-01", "2025-02-01"],
  ["orders_2025_02", "2025-02-01", "2025-03-01"],
  ["orders_2025_03", "2025-03-01", "2025-04-01"],
  ["orders_2025_04", "2025-04-01", "2025-05-01"],
  ["orders_2025_05", "2025-05-01", "2025-06-01"],
  ["orders_2025_06", "2025-06-01", "2025-07-01"],
];

const PARTITION_NAME_RE = /^orders(_2025_\d{2}|_default)$/;

const SEED_AMOUNTS = {
  "10k": 10_000,
  "100k": 100_000,
};

function assertPartitionName(name) {
  if (!PARTITION_NAME_RE.test(name)) {
    throw Object.assign(new Error(`invalid partition name: ${name}`), { status: 400 });
  }
}

async function tableExists(pool, name) {
  const result = await pool.query(
    `SELECT 1 FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind IN ('r', 'p')`,
    [name]
  );
  return result.rowCount > 0;
}

async function isAttached(pool, name) {
  const result = await pool.query(
    `SELECT 1
     FROM pg_inherits i
     JOIN pg_class parent ON parent.oid = i.inhparent
     JOIN pg_class child ON child.oid = i.inhrelid
     WHERE parent.relname = 'orders' AND child.relname = $1`,
    [name]
  );
  return result.rowCount > 0;
}

async function countRows(pool, tableName) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return result.rows[0].count;
}

async function setupPartitions(pool) {
  const created = [];

  if (!(await tableExists(pool, "orders"))) {
    await pool.query(`
      CREATE TABLE orders (
        order_id SERIAL,
        customer_id INTEGER NOT NULL,
        order_date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        PRIMARY KEY (order_id, order_date)
      ) PARTITION BY RANGE (order_date)
    `);
    created.push("orders");
  }

  for (const [name, from, to] of MONTHLY_PARTITIONS) {
    if (!(await tableExists(pool, name))) {
      await pool.query(
        `CREATE TABLE ${name} PARTITION OF orders
         FOR VALUES FROM ('${from}') TO ('${to}')`
      );
      created.push(name);
    }
  }

  if (!(await tableExists(pool, "orders_default"))) {
    await pool.query(`CREATE TABLE orders_default PARTITION OF orders DEFAULT`);
    created.push("orders_default");
  }

  return { created, partitions: MONTHLY_PARTITIONS.map(([name]) => name) };
}

async function listPartitions(pool) {
  const result = await pool.query(`
    SELECT c.relname AS partition_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^orders_(2025_[0-9]{2}|default)$'
    ORDER BY c.relname
  `);

  const partitions = [];
  for (const row of result.rows) {
    const name = row.partition_name;
    const attached = await isAttached(pool, name);
    const rowCount = await countRows(pool, name);
    const bounds = MONTHLY_PARTITIONS.find(([n]) => n === name);

    partitions.push({
      name,
      status: attached ? "attached" : "detached",
      row_count: rowCount,
      range: bounds ? { from: bounds[1], to: bounds[2] } : null,
    });
  }

  return partitions;
}

async function seedOrders(pool, amountKey) {
  const count = SEED_AMOUNTS[amountKey];
  if (!count) {
    throw Object.assign(new Error("amount must be one of: 10k, 100k"), { status: 400 });
  }

  if (!(await tableExists(pool, "orders"))) {
    throw Object.assign(new Error("orders table not found — run setup first"), { status: 404 });
  }

  const start = Date.now();
  const result = await pool.query(
    `INSERT INTO orders (customer_id, order_date, amount, status)
     SELECT
       (random() * 10000)::INTEGER + 1,
       '2025-01-01'::DATE + LEAST((random() * 181)::INTEGER, 180),
       (random() * 500 + 5)::DECIMAL(10,2),
       CASE (random() * 3)::INTEGER
         WHEN 0 THEN 'pending'
         WHEN 1 THEN 'shipped'
         WHEN 2 THEN 'delivered'
         ELSE 'pending'
       END
     FROM generate_series(1, $1) AS i`,
    [count]
  );

  return { inserted: result.rowCount, amount: amountKey, durationMs: Date.now() - start };
}

async function detachPartition(pool, name) {
  assertPartitionName(name);

  if (name === "orders_default") {
    throw Object.assign(new Error("cannot detach the default partition"), { status: 400 });
  }

  if (!(await tableExists(pool, name))) {
    throw Object.assign(new Error(`partition ${name} not found`), { status: 404 });
  }

  if (!(await isAttached(pool, name))) {
    throw Object.assign(new Error(`${name} is already detached`), { status: 400 });
  }

  await pool.query(`ALTER TABLE orders DETACH PARTITION ${name}`);
  const rowCount = await countRows(pool, name);

  return { partition: name, status: "detached", row_count: rowCount };
}

async function queryPartition(pool, name) {
  assertPartitionName(name);

  if (!(await tableExists(pool, name))) {
    throw Object.assign(new Error(`partition ${name} not found`), { status: 404 });
  }

  const attached = await isAttached(pool, name);
  const meta = MONTHLY_PARTITIONS.find(([n]) => n === name);
  const directCount = await countRows(pool, name);

  const sample = await pool.query(
    `SELECT order_id, customer_id, order_date, amount, status
     FROM ${name}
     ORDER BY order_id DESC
     LIMIT 5`
  );

  let viaParent = null;
  if (meta && attached) {
    const parentResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE order_date >= $1 AND order_date < $2`,
      [meta[1], meta[2]]
    );
    viaParent = {
      count: parentResult.rows[0].count,
      filter: `${meta[1]} .. ${meta[2]}`,
    };
  } else if (meta && !attached) {
    const parentResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE order_date >= $1 AND order_date < $2`,
      [meta[1], meta[2]]
    );
    viaParent = {
      count: parentResult.rows[0].count,
      filter: `${meta[1]} .. ${meta[2]}`,
      note: "detached — parent query should return 0 rows for this range",
    };
  }

  let explain = null;
  if (meta) {
    const plan = await pool.query(
      `EXPLAIN (FORMAT JSON)
       SELECT COUNT(*) FROM orders
       WHERE order_date >= $1 AND order_date < $2`,
      [meta[1], meta[2]]
    );
    explain = summarizeExplain(plan.rows[0]["QUERY PLAN"][0]);
  }

  return {
    partition: name,
    status: attached ? "attached" : "detached",
    direct: { count: directCount, sample: sample.rows },
    via_parent: viaParent,
    explain,
  };
}

function summarizeExplain(plan) {
  const parts = [];
  function walk(node) {
    if (!node) return;
    if (node["Relation Name"]) parts.push(node["Relation Name"]);
    if (node.Plans) node.Plans.forEach(walk);
  }
  walk(plan.Plan);
  return {
    scans: [...new Set(parts)],
    partition_pruning: parts.length <= 2,
  };
}

module.exports = {
  setupPartitions,
  listPartitions,
  seedOrders,
  detachPartition,
  queryPartition,
  MONTHLY_PARTITIONS,
};
