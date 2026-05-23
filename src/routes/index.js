const express = require("express");
const healthRoutes = require("./health");
const dbRoutes = require("./db");
const cacheRoutes = require("./cache");
const employeeRoutes = require("./employees");
const partitionRoutes = require("./partitions");
const orderRoutes = require("./orders");
const testRoutes = require("./tests");

const router = express.Router();

router.use(healthRoutes);
router.use("/db", dbRoutes);
router.use("/cache", cacheRoutes);
router.use("/employees", employeeRoutes);
router.use("/partitions", partitionRoutes);
router.use("/orders", orderRoutes);
router.use("/test", testRoutes);

module.exports = router;
