const config = require("./config");
const { createApp } = require("./app");
const { ensureSchema } = require("./db/schema");
const cache = require("./cache/redis");

async function start() {
  await ensureSchema();

  if (config.redis.enabled) {
    try {
      await cache.connectRedis();
    } catch (err) {
      console.warn("Redis unavailable — running without cache:", err.message);
    }
  }

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`Write pool → ${config.db.writeHost}:${config.db.writePort}`);
    console.log(`Read pool  → ${config.db.readHost}:${config.db.readPort}`);
    console.log(`Cache      → ${cache.isEnabled() ? "Redis ON" : "disabled"}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
