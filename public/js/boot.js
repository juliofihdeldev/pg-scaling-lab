function appendBoot(text, cls = "") {
  const log = $("#boot-log");
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text + "\n";
  log.appendChild(span);
}

async function bootSequence() {
  const lines = [
    { text: "[BOOT] pg-scaling-lab console initializing...", delay: 0 },
    { text: "[BOOT] loading kernel modules... OK", delay: 200, cls: "ok" },
    { text: "[BOOT] connecting write pool (pgbouncer:5433)...", delay: 400 },
    { text: "[BOOT] connecting read pool (pgbouncer-read:5436)...", delay: 600 },
    { text: "[BOOT] connecting Redis cache (redis:6379)...", delay: 800 },
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

async function refreshAll() {
  log("refresh", "syncing all panels...");
  await Promise.all([
    refreshDbStatus(),
    refreshEmployees(),
    refreshPartitions(),
    refreshCacheStats(),
  ]);
  $("#metric-sync").textContent = new Date().toLocaleTimeString();
  log("info", "sync complete");
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
