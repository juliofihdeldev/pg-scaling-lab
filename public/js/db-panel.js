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
