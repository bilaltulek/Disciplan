const { Pool, types } = require('pg');
const config = require('./config.env');

types.setTypeParser(1082, (val) => val); // Return DATE columns as 'YYYY-MM-DD' strings

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: true } : false,
});

module.exports = pool;
