async function refreshEmployees(bypass = false) {
  try {
    const path = bypass ? "/employees?bypass=1" : "/employees";
    const data = await api(path);
    $("#metric-employees").textContent = data.total.toLocaleString();
    $("#metric-employees").className = "value ok";
    $("#employees-total").textContent = `total: ${data.total.toLocaleString()}`;
    $("#employees-cache").textContent = `cache: ${data.cache || "—"}`;
    $("#employees-cache").className = data.cache === "hit" ? "ok" : data.cache === "miss" ? "warn" : "dim";

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
