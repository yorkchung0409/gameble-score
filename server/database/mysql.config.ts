import type { PoolOptions } from 'mysql2/promise';

function getCloudMySqlAddress(): { host?: string; port?: string } {
  const address = process.env.MYSQL_ADDRESS?.trim();
  if (!address) return {};

  const separatorIndex = address.lastIndexOf(':');
  if (separatorIndex === -1) return { host: address };

  return {
    host: address.slice(0, separatorIndex).trim(),
    port: address.slice(separatorIndex + 1).trim(),
  };
}

export function getMySqlConfig(): PoolOptions {
  const cloudAddress = getCloudMySqlAddress();
  const host = process.env.DB_HOST?.trim() || cloudAddress.host;
  const user = process.env.DB_USER?.trim() || process.env.MYSQL_USERNAME?.trim();
  const database = process.env.DB_NAME?.trim();
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD;
  const port = Number(process.env.DB_PORT ?? cloudAddress.port ?? '3306');

  if (!host || !user || !database || password === undefined) {
    throw new Error(
      'MySQL configuration is incomplete. Set DB_NAME and either DB_HOST/DB_USER/DB_PASSWORD or the WeChat Cloud Hosting MYSQL_* variables.',
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
