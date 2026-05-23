const express = require("express");
const { writePool, readPool } = require("../db/pools");
const { dbStatus } = require("../db/schema");

const router = express.Router();

router.get("/status", async (_req, res, next) => {
  try {
    const [write, read] = await Promise.all([
      dbStatus(writePool),
      dbStatus(readPool),
    ]);
    res.json({ write, read });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
