const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  replicationOk: null,
  refreshTimer: null,
};

// ── Boot sequence ──────────────────────────────────────────
async function bootSequence() {
  const log = $("#boot-log");
  const lines = [
    { text: "[BOOT] pg-scaling-lab console initializing...", delay: 0 },
    { text: "[BOOT] loading kernel modules... OK", delay: 200, cls: "ok" },
    { text: "[BOOT] connecting write pool (pgbouncer:5433)...", delay: 400 },
    { text: "[BOOT] connecting read pool (pgbouncer-read:5436)...", delay: 600 },
  ];

  for (const line of lines) {
    await sleep(line.delay);
    appendBoot(line.text, line.cls);
  }

  try {
    const health = await api("/health");
    appendBoot(`[BOOT] API health: ${health.status.toUpperCase()}`, "ok");
    await refreshAll();
    appendBoot("[BOOT] system ready — all pools online", "ok");
    setStatus(true);
  } catch {
    appendBoot("[BOOT] WARNING: API unreachable — is docker compose up?", "warn");
    setStatus(false);
  }
}

function appendBoot(text, cls = "") {
  const log = $("#boot-log");
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text + "\n";
  log.appendChild(span);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── API ────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ── Refresh ────────────────────────────────────────────────
async function refreshAll() {
  log("refresh", "syncing all panels...");
  await Promise.all([
    refreshDbStatus(),
    refreshEmployees(),
    refreshPartitions(),
  ]);
  $("#metric-sync").textContent = new Date().toLocaleTimeString();
  log("info", "sync complete");
}

async function refreshDbStatus() {
  try {
    const { write, read } = await api("/db/status");

    $("#write-status").innerHTML = formatPoolStatus(write, "PRIMARY");
    $("#read-status").innerHTML = formatPoolStatus(read, "REPLICA");

    $("#metric-api").textContent = "ONLINE";
    $("#metric-api").className = "value ok";
  } catch (err) {
    $("#write-status").innerHTML = `<span class="err">ERROR: ${err.message}</span>`;
    $("#read-status").innerHTML = `<span class="err">ERROR: ${err.message}</span>`;
    $("#metric-api").textContent = "OFFLINE";
    $("#metric-api").className = "value err";
    setStatus(false);
    throw err;
  }
}

function formatPoolStatus(pool, role) {
  const replica = pool.is_replica;
  const roleOk = role === "PRIMARY" ? !replica : replica;
  return [
    `role       : <span class="${roleOk ? "ok" : "err"}">${role}${roleOk ? " ✓" : " ✗"}</span>`,
    `is_replica : ${replica}`,
    `server_ip  : ${pool.server_ip || "n/a"}`,
    `port       : ${pool.server_port}`,
    `database   : ${pool.database}`,
  ].join("\n");
}

async function refreshEmployees() {
  try {
    const data = await api("/employees");
    $("#metric-employees").textContent = data.total.toLocaleString();
    $("#metric-employees").className = "value ok";
    $("#employees-total").textContent = `total: ${data.total.toLocaleString()}`;

    const tbody = $("#employees-body");
    if (data.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="dim">no rows — insert via form above</td></tr>`;
      return;
    }

    tbody.innerHTML = data.rows
      .map(
        (r) => `<tr>
          <td>${r.id}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.department || "—")}</td>
          <td>${r.salary != null ? "$" + Number(r.salary).toLocaleString() : "—"}</td>
        </tr>`
      )
      .join("");
  } catch (err) {
    $("#metric-employees").textContent = "ERR";
    $("#metric-employees").className = "value err";
    log("err", `employees: ${err.message}`);
  }
}

const BULK_LABELS = { "10k": "10,000", "100k": "100,000", "1m": "1,000,000" };

async function bulkGenerateEmployees(amount) {
  const label = BULK_LABELS[amount];
  const needsConfirm = amount === "100k" || amount === "1m";
  const msg =
    amount === "1m"
      ? `Generate 1,000,000 employees? This may take 1–3 minutes and will stress the write pool.`
      : `Generate ${label} employees via the write pool?`;

  if (needsConfirm && !confirm(msg)) return;

  const out = $("#bulk-output");
  const buttons = $$(".bulk-btn");
  buttons.forEach((b) => (b.disabled = true));
  out.innerHTML = `<span class="warn">inserting ${label} rows... please wait</span>`;
  log("info", `bulk insert started: ${amount}`);

  const start = Date.now();

  try {
    const data = await api("/employees/bulk", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    out.innerHTML = [
      `<span class="ok">INSERT COMPLETE ✓</span>`,
      `amount     : ${data.amount.toUpperCase()} (${data.inserted.toLocaleString()} rows)`,
      `duration   : ${(data.durationMs / 1000).toFixed(1)}s (client: ${elapsed}s)`,
      `source     : write pool → primary`,
      ``,
      `<span class="dim">replicas will catch up via WAL — check REPLICATION panel</span>`,
    ].join("\n");

    log("info", `bulk insert ok — ${data.inserted.toLocaleString()} rows in ${elapsed}s`);
    await refreshEmployees();
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `bulk insert failed: ${err.message}`);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function refreshPartitions() {
  const tbody = $("#partitions-body");
  const hint = $("#partitions-hint");

  try {
    const data = await api("/partitions");

    if (data.setup_required || data.partitions.length === 0) {
      $("#metric-partitions").textContent = "0";
      $("#metric-partitions").className = "value warn";
      tbody.innerHTML = `<tr><td colspan="4" class="dim">no partitions — run Step 1 to create them</td></tr>`;
      hint.textContent = "";
      return;
    }

    const max = Math.max(...data.partitions.map((p) => p.row_count), 1);

    $("#metric-partitions").textContent = data.partitions.length;
    $("#metric-partitions").className = "value ok";
    hint.textContent = "";

    tbody.innerHTML = data.partitions
      .map((p) => {
        const pct = Math.round((p.row_count / max) * 100);
        return `<tr>
          <td>${esc(p.name)}</td>
          <td><span class="status-badge ${p.status}">${p.status.toUpperCase()}</span></td>
          <td>${p.row_count.toLocaleString()}</td>
          <td><div class="bar-cell"><div class="bar" style="width:${pct}px"></div><span class="dim">${pct}%</span></div></td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    $("#metric-partitions").textContent = "N/A";
    $("#metric-partitions").className = "value warn";
    tbody.innerHTML = `<tr><td colspan="4" class="dim">${esc(err.message)}</td></tr>`;
    hint.textContent = "";
  }
}

async function setupPartitions() {
  const btn = $("#partition-setup-btn");
  const out = $("#partition-setup-output");
  btn.disabled = true;
  out.innerHTML = `<span class="warn">creating partitions...</span>`;

  try {
    const data = await api("/partitions/setup", { method: "POST" });
    const created = data.created.length
      ? data.created.join(", ")
      : "already existed (no changes)";

    out.innerHTML = [
      `<span class="ok">SETUP COMPLETE ✓</span>`,
      `created    : ${esc(created)}`,
      `months     : Jan–Jun 2025 + orders_default`,
    ].join("\n");

    log("info", `partition setup: ${data.created.length} objects created`);
    await refreshPartitions();
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `partition setup failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function seedOrders(amount) {
  const label = amount === "100k" ? "100,000" : "10,000";
  if (amount === "100k" && !confirm(`Seed ${label} orders across Jan–Jun 2025?`)) return;

  const out = $("#partition-seed-output");
  const buttons = $$(".orders-seed-btn");
  buttons.forEach((b) => (b.disabled = true));
  out.innerHTML = `<span class="warn">inserting ${label} orders...</span>`;

  try {
    const data = await api("/partitions/seed", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });

    out.innerHTML = [
      `<span class="ok">SEED COMPLETE ✓</span>`,
      `inserted   : ${data.inserted.toLocaleString()} rows`,
      `duration   : ${(data.durationMs / 1000).toFixed(1)}s`,
      `source     : write pool → primary`,
    ].join("\n");

    log("info", `orders seeded: ${data.inserted.toLocaleString()} rows`);
    await refreshPartitions();
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `orders seed failed: ${err.message}`);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function detachPartition() {
  const name = $("#detach-select").value;
  if (!confirm(`Detach ${name}? It becomes a standalone table — parent queries will no longer include its rows.`)) {
    return;
  }

  const btn = $("#partition-detach-btn");
  const out = $("#partition-detach-output");
  btn.disabled = true;
  out.innerHTML = `<span class="warn">detaching ${name}...</span>`;

  try {
    const data = await api("/partitions/detach", {
      method: "POST",
      body: JSON.stringify({ partition: name }),
    });

    out.innerHTML = [
      `<span class="ok">DETACH COMPLETE ✓</span>`,
      `partition  : ${esc(data.partition)}`,
      `status     : ${data.status}`,
      `rows kept  : ${data.row_count.toLocaleString()}`,
      ``,
      `<span class="dim">run Step 4 query test to compare parent vs direct access</span>`,
    ].join("\n");

    log("info", `detached ${name} (${data.row_count} rows)`);
    await refreshPartitions();
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `detach failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function queryPartitionTest() {
  const name = $("#query-select").value;
  const btn = $("#partition-query-btn");
  const out = $("#partition-query-output");
  btn.disabled = true;
  out.textContent = "running queries...";

  try {
    const data = await api(`/partitions/query/${name}`);

    const sampleLines = data.direct.sample.length
      ? data.direct.sample
          .map(
            (r) =>
              `  id=${r.order_id} date=${r.order_date} amount=$${Number(r.amount).toFixed(2)}`
          )
          .join("\n")
      : "  (no rows)";

    const parentOk =
      data.status === "detached"
        ? data.via_parent?.count === 0
        : data.via_parent?.count === data.direct.count;

    out.innerHTML = [
      `partition  : ${esc(data.partition)} [${data.status.toUpperCase()}]`,
      ``,
      `── DIRECT QUERY ──`,
      `SELECT COUNT(*) FROM ${esc(name)}`,
      `result     : ${data.direct.count.toLocaleString()} rows`,
      `sample     :`,
      sampleLines,
      ``,
      `── PARENT QUERY ──`,
      data.via_parent
        ? `SELECT COUNT(*) FROM orders WHERE order_date ${esc(data.via_parent.filter)}`
        : "n/a",
      data.via_parent
        ? `result     : ${data.via_parent.count.toLocaleString()} rows`
        : "",
      data.via_parent?.note ? `note       : ${esc(data.via_parent.note)}` : "",
      ``,
      `── EXPLAIN (partition pruning) ──`,
      data.explain
        ? `scans      : ${data.explain.scans.join(", ") || "none"}`
        : "n/a",
      data.explain
        ? `pruning    : ${data.explain.partition_pruning ? "<span class='ok'>YES — only relevant partition scanned</span>" : "<span class='warn'>multiple partitions scanned</span>"}`
        : "",
      ``,
      parentOk
        ? `<span class="ok">EXPECTED BEHAVIOR ✓</span>`
        : `<span class="warn">CHECK RESULTS — attached partitions should match; detached parent should be 0</span>`,
    ]
      .filter(Boolean)
      .join("\n");

    log("info", `query test ${name}: direct=${data.direct.count} parent=${data.via_parent?.count ?? "n/a"}`);
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `query test failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function runReplicationTest() {
  const btn = $("#replication-btn");
  const out = $("#replication-output");
  btn.disabled = true;
  out.textContent = "running test...\n";
  log("info", "replication test started");

  try {
    const data = await api("/test/replication");
    const status = data.replicated ? "PASS" : "LAG";
    state.replicationOk = data.replicated;

    $("#metric-replication").textContent = status;
    $("#metric-replication").className = `value ${data.replicated ? "ok" : "warn"}`;

    out.innerHTML = [
      `marker     : ${esc(data.marker)}`,
      ``,
      `write pool : ${data.writePool.found ? "<span class='ok'>FOUND ✓</span>" : "<span class='err'>NOT FOUND ✗</span>"}`,
      `             id=${data.writePool.row?.id ?? "—"}`,
      ``,
      `read pool  : ${data.readPool.found ? "<span class='ok'>FOUND ✓</span>" : "<span class='warn'>NOT FOUND (lag)</span>"}`,
      `             id=${data.readPool.row?.id ?? "—"}`,
      ``,
      `replicated : ${data.replicated}`,
      `note       : ${esc(data.note)}`,
    ].join("\n");

    log(data.replicated ? "info" : "warn", `replication test: ${data.note}`);
    await refreshEmployees();
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    $("#metric-replication").textContent = "ERR";
    $("#metric-replication").className = "value err";
    log("err", `replication test failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ── UI helpers ─────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(online) {
  const dot = $("#status-dot");
  const text = $("#status-text");
  dot.className = `status-dot ${online ? "online" : "offline"}`;
  text.textContent = online ? "connected — write:5433 read:5436" : "disconnected";
  text.className = online ? "ok" : "err";
}

function log(level, msg) {
  const el = $("#console-log");
  const ts = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = `log-line ${level}`;
  line.innerHTML = `<span class="ts">${ts}</span><span class="msg">${esc(msg)}</span>`;
  el.prepend(line);
  while (el.children.length > 30) el.lastChild.remove();
}

function updateClock() {
  $("#clock").textContent = new Date().toLocaleTimeString();
}

function setupNav() {
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      $$(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(`#panel-${btn.dataset.panel}`).classList.add("active");
    });
  });
}

function setupAutoRefresh() {
  const toggle = $("#auto-refresh");

  function schedule() {
    clearInterval(state.refreshTimer);
    if (toggle.checked) {
      state.refreshTimer = setInterval(refreshAll, 5000);
    }
  }

  toggle.addEventListener("change", schedule);
  schedule();
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupAutoRefresh();
  updateClock();
  setInterval(updateClock, 1000);

  $("#refresh-btn").addEventListener("click", refreshAll);
  $("#replication-btn").addEventListener("click", runReplicationTest);

  $("#employee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get("name"),
      department: fd.get("department") || null,
      salary: fd.get("salary") ? Number(fd.get("salary")) : null,
    };

    try {
      const data = await api("/employees", {
        method: "POST",
        body: JSON.stringify(body),
      });
      log("info", `INSERT ok — id=${data.row.id} name=${data.row.name} (write pool)`);
      e.target.reset();
      await refreshEmployees();
    } catch (err) {
      log("err", `INSERT failed: ${err.message}`);
    }
  });

  $$(".bulk-btn").forEach((btn) => {
    btn.addEventListener("click", () => bulkGenerateEmployees(btn.dataset.amount));
  });

  $$(".orders-seed-btn").forEach((btn) => {
    btn.addEventListener("click", () => seedOrders(btn.dataset.amount));
  });

  $("#partition-setup-btn").addEventListener("click", setupPartitions);
  $("#partition-detach-btn").addEventListener("click", detachPartition);
  $("#partition-query-btn").addEventListener("click", queryPartitionTest);

  bootSequence();
});
