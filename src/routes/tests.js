const express = require("express");
const tests = require("../services/tests");

const router = express.Router();

router.get("/replication", async (_req, res, next) => {
  try {
    res.json(await tests.runReplicationTest());
  } catch (err) {
    next(err);
  }
});

router.get("/cache", async (_req, res, next) => {
  try {
    res.json(await tests.runCacheTest());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
