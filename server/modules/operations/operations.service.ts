import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  games,
  mahjongRoomMembers,
  mahjongRooms,
  mahjongTransactions,
  userRoomVisits,
  users,
} from '@server/database/schema';
import type { MiniOperationsOverviewResponse } from '@shared/api.interface';
import { MahjongRealtimeService } from '@server/modules/mahjong/mahjong-realtime.service';

const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_ROOM_WINDOW_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function toCount(rows: { total: number | string | null | undefined }[]): number {
  return Number(rows[0]?.total || 0);
}

@Injectable()
export class OperationsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DbType,
    private readonly realtimeService: MahjongRealtimeService,
  ) {}

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
    const activeUserCutoff = new Date(now - ACTIVE_USER_WINDOW_MS);
    const activeRoomCutoff = new Date(now - ACTIVE_ROOM_WINDOW_MS);
    const hourCutoff = new Date(now - ONE_HOUR_MS);
    const dayCutoff = new Date(now - ONE_DAY_MS);

    const [
      totalUsers,
      newUsers,
      recentVisitUsers,
      recentMemberUsers,
      recentTransactionPayers,
      recentTransactionPayees,
      activeMahjongRooms,
      activePokerRooms,
      hourlyTransactions,
      dailyTransactions,
      dailyReversals,
    ] = await Promise.all([
      this.db.select({ total: count() }).from(users),
      this.db.select({ total: count() }).from(users).where(gte(users.createdAt, dayCutoff)),
      this.db
        .select({ userId: userRoomVisits.userId })
        .from(userRoomVisits)
        .where(and(isNotNull(userRoomVisits.userId), gte(userRoomVisits.lastVisitedAt, activeUserCutoff))),
      this.db
        .select({ userId: mahjongRoomMembers.userId })
        .from(mahjongRoomMembers)
        .where(gte(mahjongRoomMembers.joinedAt, activeUserCutoff)),
      this.db
        .select({ userId: mahjongTransactions.payerId })
        .from(mahjongTransactions)
        .where(gte(mahjongTransactions.createdAt, activeUserCutoff)),
      this.db
        .select({ userId: mahjongTransactions.payeeId })
        .from(mahjongTransactions)
        .where(and(eq(mahjongTransactions.payeeType, 'user'), gte(mahjongTransactions.createdAt, activeUserCutoff))),
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
      this.db.select({ total: count() }).from(mahjongTransactions).where(gte(mahjongTransactions.createdAt, hourCutoff)),
      this.db.select({ total: count() }).from(mahjongTransactions).where(gte(mahjongTransactions.createdAt, dayCutoff)),
      this.db
        .select({ total: count() })
        .from(mahjongTransactions)
        .where(and(isNotNull(mahjongTransactions.reversalOf), gte(mahjongTransactions.createdAt, dayCutoff))),
    ]);

    const activeUserIds = new Set<string>();
    for (const row of [...recentVisitUsers, ...recentMemberUsers, ...recentTransactionPayers, ...recentTransactionPayees]) {
      if (row.userId) activeUserIds.add(row.userId);
    }

    return {
      generatedAt: new Date().toISOString(),
      users: {
        total: toCount(totalUsers),
        newIn24Hours: toCount(newUsers),
        activeIn5Minutes: activeUserIds.size,
      },
      rooms: {
        activeMahjongIn30Minutes: toCount(activeMahjongRooms),
        activePokerIn30Minutes: toCount(activePokerRooms),
      },
      transactions: {
        inLastHour: toCount(hourlyTransactions),
        inLast24Hours: toCount(dailyTransactions),
        reversalsInLast24Hours: toCount(dailyReversals),
      },
      realtime: this.realtimeService.getLocalConnectionStats(),
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
