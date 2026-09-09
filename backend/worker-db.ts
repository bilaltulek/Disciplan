const { Pool, types } = require('pg');
const config = require('./config.env');

types.setTypeParser(1082, (value: any) => value);

export = new Pool({
  connectionString: config.agentDatabaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: true } : false,
  max: Number.parseInt(process.env.AGENT_DATABASE_POOL_MAX || '5', 10),
});
