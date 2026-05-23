const { createClient } = require("redis");

const TTL = Number(process.env.CACHE_TTL_SECONDS || 30);

const stats = { hits: 0, misses: 0, invalidations: 0 };

let client = null;
let ready = false;

const KEYS = {
  employeesList: "employees:list",
};

async function connectRedis() {
  const url =
    process.env.REDIS_URL ||
    `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;

  client = createClient({ url });
  client.on("error", (err) => console.error("Redis error:", err.message));

  await client.connect();
  ready = true;
  console.log(`Redis connected → ${url}`);
}

function isEnabled() {
  return ready && client?.isOpen;
}

async function getJson(key) {
  if (!isEnabled()) return null;
  const raw = await client.get(key);
  if (raw == null) return null;
  stats.hits++;
  return JSON.parse(raw);
}

async function setJson(key, value, ttlSec = TTL) {
  if (!isEnabled()) return;
  await client.set(key, JSON.stringify(value), { EX: ttlSec });
}

async function delKeys(...keys) {
  if (!isEnabled() || keys.length === 0) return 0;
  const removed = await client.del(keys);
  stats.invalidations += removed;
  return removed;
}

async function getOrFetch(key, fetchFn, ttlSec = TTL) {
  const cached = await getJson(key);
  if (cached != null) {
    return { data: cached, cache: "hit" };
  }

  stats.misses++;
  const data = await fetchFn();
  await setJson(key, data, ttlSec);
  return { data, cache: "miss" };
}

async function invalidateEmployees() {
  return delKeys(KEYS.employeesList);
}

async function flushAll() {
  if (!isEnabled()) return;
  await client.flushDb();
  stats.hits = 0;
  stats.misses = 0;
  stats.invalidations = 0;
}

async function getStats() {
  let redisInfo = null;
  if (isEnabled()) {
    const info = await client.info("stats");
    const keyspace = await client.info("keyspace");
    redisInfo = {
      connected: true,
      keys: parseKeyCount(keyspace),
      keyspace_hits: parseInfoValue(info, "keyspace_hits"),
      keyspace_misses: parseInfoValue(info, "keyspace_misses"),
    };
  }

  const total = stats.hits + stats.misses;
  return {
    enabled: isEnabled(),
    ttl_seconds: TTL,
    app: {
      hits: stats.hits,
      misses: stats.misses,
      invalidations: stats.invalidations,
      hit_rate: total ? Math.round((stats.hits / total) * 100) : 0,
    },
    redis: redisInfo,
  };
}

function parseKeyCount(keyspace) {
  const match = keyspace.match(/keys=(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseInfoValue(info, key) {
  const match = info.match(new RegExp(`${key}:(\\d+)`));
  return match ? Number(match[1]) : 0;
}

module.exports = {
  connectRedis,
  isEnabled,
  KEYS,
  getOrFetch,
  invalidateEmployees,
  delKeys,
  flushAll,
  getStats,
  TTL,
};
