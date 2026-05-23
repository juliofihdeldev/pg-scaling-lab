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

  $("#cache-test-btn").addEventListener("click", runCacheTest);
  $("#cache-flush-btn").addEventListener("click", flushCache);
  $("#cache-bypass-btn").addEventListener("click", bypassCacheFetch);

  bootSequence();
});
