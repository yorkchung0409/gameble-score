const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

function getCloudMySqlAddress() {
  const address = process.env.MYSQL_ADDRESS && process.env.MYSQL_ADDRESS.trim();
  if (!address) return {};

  const separatorIndex = address.lastIndexOf(':');
  if (separatorIndex === -1) return { host: address };

  return {
    host: address.slice(0, separatorIndex).trim(),
    port: address.slice(separatorIndex + 1).trim(),
  };
}

function getConfig() {
  const cloudAddress = getCloudMySqlAddress();
  const host = (process.env.DB_HOST && process.env.DB_HOST.trim()) || cloudAddress.host;
  const user =
    (process.env.DB_USER && process.env.DB_USER.trim()) ||
    (process.env.MYSQL_USERNAME && process.env.MYSQL_USERNAME.trim());
  const database = process.env.DB_NAME && process.env.DB_NAME.trim();
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD;
  const port = Number(process.env.DB_PORT || cloudAddress.port || '3306');

  if (!host || !user || !database || password === undefined) {
    throw new Error(
      'Set DB_NAME and either DB_HOST/DB_USER/DB_PASSWORD or the WeChat Cloud Hosting MYSQL_* variables before starting the service.',
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port.');
  }
  return { host, port, user, password, database, charset: 'utf8mb4', multipleStatements: true };
}

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(getConfig());
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'init.sql'), 'utf8');
    await connection.query(schemaSql);
    console.log('MySQL schema initialized successfully');
  } catch (error) {
    console.error('Failed to initialize MySQL schema:', error);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

main();
