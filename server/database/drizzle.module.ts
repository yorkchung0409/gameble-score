import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2';
import type { Pool } from 'mysql2';
import * as schema from './schema';
import { getMySqlConfig } from './mysql.config';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export const MYSQL_POOL = 'MYSQL_POOL';
export type DbType = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: MYSQL_POOL,
      useFactory: () => {
        const pool = mysql.createPool({
          ...getMySqlConfig(),
          connectionLimit: 10,
        });
        pool.on('connection', (connection) => {
          connection.query("SET time_zone = '+08:00'");
        });
        return pool;
      },
    },
    {
      provide: DRIZZLE_DB,
      inject: [MYSQL_POOL],
      useFactory: (pool: Pool) => drizzle(pool.promise(), { schema, mode: 'default' }),
    },
  ],
  exports: [DRIZZLE_DB, MYSQL_POOL],
})
export class DatabaseModule {}
