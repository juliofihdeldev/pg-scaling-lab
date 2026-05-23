const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  replicationOk: null,
  refreshTimer: null,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
