const { Pool, types } = require('pg');
const config = require('./config.env');

types.setTypeParser(1082, (value: any) => value);

module.exports = new Pool({
  connectionString: config.migrationDatabaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: true } : false,
  max: 2,
});
