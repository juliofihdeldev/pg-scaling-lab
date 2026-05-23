const express = require("express");
const cache = require("../cache/redis");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", cache: cache.isEnabled() });
});

module.exports = router;
