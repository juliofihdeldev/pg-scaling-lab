const express = require("express");
const employees = require("../services/employees");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const bypass = req.query.bypass === "1" || req.query.bypass === "true";

  try {
    const data = await employees.list(bypass);
    if (data.cache === "hit") {
      res.set("X-Cache", "HIT");
    } else if (data.cache === "miss") {
      res.set("X-Cache", "MISS");
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/bulk", async (req, res, next) => {
  try {
    const amount = String(req.body.amount || "").toLowerCase();
    const result = await employees.bulkCreate(amount);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const result = await employees.getById(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Employee not found" });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { name, department, salary } = req.body;
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const result = await employees.create({ name, department, salary });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
