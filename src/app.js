const express = require("express");
const path = require("path");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(routes);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
