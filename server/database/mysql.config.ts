import type { PoolOptions } from 'mysql2/promise';

export function getMySqlConfig(): PoolOptions {
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const database = process.env.DB_NAME?.trim();
  const password = process.env.DB_PASSWORD;
  const port = Number(process.env.DB_PORT ?? '3306');

  if (!host || !user || !database || password === undefined) {
    throw new Error(
      'MySQL configuration is incomplete. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.',
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port.');
  }

  return {
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4',
    timezone: 'Z',
  };
}
