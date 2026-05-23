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
