import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import { getMySqlConfig } from './mysql.config';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export type DbType = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: () => {
        const queryClient = mysql.createPool({
          ...getMySqlConfig(),
          connectionLimit: 10,
        });
        return drizzle(queryClient, { schema, mode: 'default' });
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
