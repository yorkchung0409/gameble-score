import { Module, Global } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE_DB = 'DRIZZLE_DB';
export type DbType = ReturnType<typeof drizzle<typeof schema>>;

// 幂等迁移：应用启动时自动补齐新增的表 / 列（对已存在的表不产生破坏）
async function runStartupMigrations(queryClient: ReturnType<typeof postgres>) {
  await queryClient.unsafe(`
    ALTER TABLE mahjong_rooms ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'seated';
    ALTER TABLE mahjong_rooms ADD COLUMN IF NOT EXISTS creator_user_id UUID;
    ALTER TABLE mahjong_rooms ADD COLUMN IF NOT EXISTS dissolved_at TIMESTAMP(6);
    CREATE TABLE IF NOT EXISTS mahjong_room_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mahjong_room_members_room_id ON mahjong_room_members(room_id);
  `);
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
          throw new Error('DATABASE_URL environment variable is not set');
        }
        const queryClient = postgres(databaseUrl, { max: 10 });
        await runStartupMigrations(queryClient);
        return drizzle(queryClient, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
