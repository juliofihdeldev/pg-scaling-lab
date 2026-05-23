const express = require("express");
const cache = require("../cache/redis");

const router = express.Router();

router.get("/stats", async (_req, res, next) => {
  try {
    res.json(await cache.getStats());
  } catch (err) {
    next(err);
  }
});

router.post("/flush", async (_req, res, next) => {
  try {
    await cache.flushAll();
    res.json({ flushed: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
