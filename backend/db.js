const { Pool } = require('pg');
const config = require('./config.env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
