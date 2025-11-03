const { Pool } = require("pg");

const pool = new Pool({
  user: "placeholder",
  host: "placeholder", 
  database: "placeholder", 
  password: "placeholder", 
  port: 1234, 
});

module.exports = pool;