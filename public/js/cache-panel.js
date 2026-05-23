async function refreshCacheStats() {
  const out = $("#cache-stats-output");
  if (!out) return;

  try {
    const data = await api("/cache/stats");
    const app = data.app;
    $("#metric-cache").textContent = data.enabled ? `${app.hit_rate}%` : "OFF";
    $("#metric-cache").className = `value ${data.enabled ? "ok" : "warn"}`;

    out.innerHTML = [
      `enabled      : ${data.enabled ? "<span class='ok'>YES</span>" : "<span class='warn'>NO</span>"}`,
      `ttl          : ${data.ttl_seconds}s`,
      `hits         : ${app.hits}`,
      `misses       : ${app.misses}`,
      `hit rate     : ${app.hit_rate}%`,
      `invalidations: ${app.invalidations}`,
      data.redis ? `redis keys   : ${data.redis.keys}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    $("#metric-cache").textContent = "ERR";
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
  }
}

async function runCacheTest() {
  const btn = $("#cache-test-btn");
  const out = $("#cache-test-output");
  btn.disabled = true;
  out.textContent = "running...";

  try {
    const data = await api("/test/cache");
    out.innerHTML = [
      `<span class="ok">CACHE TEST COMPLETE</span>`,
      `1st request  : cache=${data.first_request.cache} total=${data.first_request.total}`,
      `2nd request  : cache=${data.second_request.cache} total=${data.second_request.total}`,
      `expected     : ${esc(data.expected)}`,
      ``,
      `hits=${data.stats.hits} misses=${data.stats.misses} hit_rate=${data.stats.hit_rate}%`,
    ].join("\n");
    log("info", `cache test: ${data.first_request.cache} → ${data.second_request.cache}`);
    await Promise.all([refreshCacheStats(), refreshEmployees()]);
  } catch (err) {
    out.innerHTML = `<span class="err">ERROR: ${esc(err.message)}</span>`;
    log("err", `cache test failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function flushCache() {
  if (!confirm("Flush all Redis keys?")) return;
  try {
    await api("/cache/flush", { method: "POST" });
    log("info", "cache flushed");
    $("#cache-test-output").innerHTML = `<span class="warn">cache flushed — next read will be a miss</span>`;
    await Promise.all([refreshCacheStats(), refreshEmployees()]);
  } catch (err) {
    log("err", `cache flush failed: ${err.message}`);
  }
}

async function bypassCacheFetch() {
  try {
    await refreshEmployees(true);
    log("info", "employees fetched with cache bypass (read pool direct)");
    await refreshCacheStats();
  } catch (err) {
    log("err", `bypass fetch failed: ${err.message}`);
  }
}
