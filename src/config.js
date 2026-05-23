module.exports = {
  port: Number(process.env.PORT || 3000),
  db: {
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "scalinglab",
    writeHost: process.env.WRITE_DB_HOST || "localhost",
    writePort: Number(process.env.WRITE_DB_PORT || 5433),
    readHost: process.env.READ_DB_HOST || "localhost",
    readPort: Number(process.env.READ_DB_PORT || 5436),
  },
  redis: {
    enabled: process.env.REDIS_ENABLED !== "false",
    url:
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`,
    ttlSeconds: Number(process.env.CACHE_TTL_SECONDS || 30),
  },
};
