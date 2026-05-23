const express = require("express");
const { writePool, readPool } = require("../db/pools");
const partitions = require("../services/partitions");

const router = express.Router();

router.post("/setup", async (_req, res, next) => {
  try {
    const result = await partitions.setupPartitions(writePool);
    res.status(201).json({ source: "write-pool", ...result });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const list = await partitions.listPartitions(readPool);
    res.json({ source: "read-pool", partitions: list });
  } catch (err) {
    if (err.code === "42P01") {
      return res.json({ source: "read-pool", partitions: [], setup_required: true });
    }
    next(err);
  }
});

router.post("/seed", async (req, res, next) => {
  try {
    const amount = String(req.body.amount || "100k").toLowerCase();
    const result = await partitions.seedOrders(writePool, amount);
    res.status(201).json({ source: "write-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post("/detach", async (req, res, next) => {
  try {
    const name = req.body.partition;
    if (!name) {
      return res.status(400).json({ error: "partition is required" });
    }
    const result = await partitions.detachPartition(writePool, name);
    res.json({ source: "write-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/query/:name", async (req, res, next) => {
  try {
    const result = await partitions.queryPartition(readPool, req.params.name);
    res.json({ source: "read-pool", ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
