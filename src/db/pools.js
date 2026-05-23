const { Pool } = require("pg");
const config = require("../config");

const { user, password, database, writeHost, writePort, readHost, readPort } =
  config.db;

const writePool = new Pool({
  user,
  password,
  database,
  host: writeHost,
  port: writePort,
  max: 10,
});

const readPool = new Pool({
  user,
  password,
  database,
  host: readHost,
  port: readPort,
  max: 10,
});

module.exports = { writePool, readPool };
