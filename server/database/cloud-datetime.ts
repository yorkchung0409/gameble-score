import { customType } from 'drizzle-orm/mysql-core';

const CLOUD_DATABASE_OFFSET_MINUTES = 8 * 60;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** WeChat Cloud Hosting stores DATETIME values using its +08:00 session clock. */
export function parseCloudDateTime(value: string): Date {
  return new Date(value.replace(' ', 'T') + '+08:00');
}

export function formatCloudDateTime(value: Date): string {
  const shifted = new Date(value.getTime() + CLOUD_DATABASE_OFFSET_MINUTES * 60_000);
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}.${pad(shifted.getUTCMilliseconds(), 3)}`,
  ].join(' ');
}

export const cloudDateTime = customType<{
  data: Date;
  driverData: string;
  config: { fsp?: number };
}>({
  dataType(config) {
    return config?.fsp === undefined ? 'datetime' : `datetime(${config.fsp})`;
  },
  fromDriver(value) {
    return parseCloudDateTime(value);
  },
  toDriver(value) {
    return formatCloudDateTime(value);
  },
});
