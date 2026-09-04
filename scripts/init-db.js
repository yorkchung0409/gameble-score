const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

function getConfig() {
  const host = process.env.DB_HOST && process.env.DB_HOST.trim();
  const user = process.env.DB_USER && process.env.DB_USER.trim();
  const database = process.env.DB_NAME && process.env.DB_NAME.trim();
  const password = process.env.DB_PASSWORD;
  const port = Number(process.env.DB_PORT || '3306');

  if (!host || !user || !database || password === undefined) {
    throw new Error(
      'Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME before starting the service.',
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
