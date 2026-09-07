const path = require('node:path');
const dotenv = require('dotenv');

const LOCAL_HOST = '127.0.0.1';

function loadConfig(env = process.env) {
  dotenv.config({
    path: env.OPERATIONS_ENV_FILE || path.resolve(__dirname, '.env.operations.local'),
    processEnv: env,
    quiet: true,
  });
  const port = Number(env.OPERATIONS_PORT || '4177');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('OPERATIONS_PORT must be a valid local port.');
  }
  return {
    host: LOCAL_HOST,
    port,
    database: env.OPERATIONS_DB_NAME?.trim() || 'gameble_score',
    dbHost: env.OPERATIONS_DB_HOST?.trim() || '',
    dbPort: Number(env.OPERATIONS_DB_PORT || '3306'),
    dbUser: env.OPERATIONS_DB_USER?.trim() || '',
    dbPassword: env.OPERATIONS_DB_PASSWORD ?? '',
  };
}

function validateDatabaseConfig(config) {
  if (!config.dbHost || !config.dbUser || !config.dbPassword) {
    throw new Error('Missing local operations database configuration. See tools/operations-dashboard/.env.operations.example.');
  }
  if (!Number.isInteger(config.dbPort) || config.dbPort < 1 || config.dbPort > 65535) {
    throw new Error('OPERATIONS_DB_PORT must be a valid TCP port.');
  }
}

module.exports = { LOCAL_HOST, loadConfig, validateDatabaseConfig };
