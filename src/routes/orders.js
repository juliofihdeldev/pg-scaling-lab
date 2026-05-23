const express = require("express");
const employees = require("../services/employees");

const router = express.Router();

router.get("/summary", async (_req, res, next) => {
  try {
    res.json(await employees.ordersSummary());
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(404).json({
        error: "orders table not found — use PARTITIONS panel to run setup",
      });
    }
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { customer_id, order_date, amount, status } = req.body;
  if (!customer_id || !order_date || amount == null) {
    return res.status(400).json({
      error: "customer_id, order_date, and amount are required",
    });
  }

  try {
    const result = await employees.createOrder({
      customer_id,
      order_date,
      amount,
      status,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(404).json({
        error: "orders table not found — run the partitioning section of sql/seed.sql on the primary first",
      });
    }
    next(err);
  }
});

module.exports = router;
