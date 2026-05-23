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
