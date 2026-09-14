import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, eq, gte, isNull, or } from 'drizzle-orm';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  games,
  mahjongRooms,
  mahjongTransactions,
  users,
} from '@server/database/schema';
import type { MiniOperationsOverviewResponse } from '@shared/api.interface';

const ACTIVE_ROOM_WINDOW_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toCount(rows: { total: number | string | null | undefined }[]): number {
  return Number(rows[0]?.total || 0);
}

@Injectable()
export class OperationsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  isAdminOpenId(cloudOpenId?: string): boolean {
    const normalizedOpenId = cloudOpenId?.trim();
    if (!normalizedOpenId) return false;
    return this.getAdminOpenIds().has(normalizedOpenId);
  }

  async getOverview(cloudOpenId?: string): Promise<MiniOperationsOverviewResponse> {
    if (!this.isAdminOpenId(cloudOpenId)) {
      throw new ForbiddenException('无权访问运营数据');
    }

    const now = Date.now();
    const activeRoomCutoff = new Date(now - ACTIVE_ROOM_WINDOW_MS);
    const dayCutoff = new Date(now - ONE_DAY_MS);

    const [
      totalUsers,
      newUsers,
      activeMahjongRooms,
      activePokerRooms,
    ] = await Promise.all([
      this.db.select({ total: count() }).from(users),
      this.db.select({ total: count() }).from(users).where(gte(users.createdAt, dayCutoff)),
      this.db
        .select({ total: countDistinct(mahjongRooms.id) })
        .from(mahjongRooms)
        .leftJoin(mahjongTransactions, eq(mahjongTransactions.roomId, mahjongRooms.id))
        .where(and(
          isNull(mahjongRooms.dissolvedAt),
          or(
            gte(mahjongRooms.createdAt, activeRoomCutoff),
            gte(mahjongTransactions.createdAt, activeRoomCutoff),
          ),
        )),
      this.db
        .select({ total: countDistinct(games.roomId) })
        .from(games)
        .where(gte(games.createdAt, activeRoomCutoff)),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      users: {
        total: toCount(totalUsers),
        newIn24Hours: toCount(newUsers),
      },
      rooms: {
        activeMahjongIn30Minutes: toCount(activeMahjongRooms),
        activePokerIn30Minutes: toCount(activePokerRooms),
      },
    };
  }

  private getAdminOpenIds(): Set<string> {
    return new Set(
      (process.env.ADMIN_WECHAT_OPENIDS || '')
        .split(',')
        .map((openId) => openId.trim())
        .filter(Boolean),
    );
  }
}
