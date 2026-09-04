import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, or } from 'drizzle-orm';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  gamePlayers,
  mahjongRoomMembers,
  mahjongRooms,
  mahjongTransactions,
  pokerLedgerOwners,
  rooms,
  users,
} from '@server/database/schema';
import { fromCents, toCents } from '@server/common/utils';
import type {
  MahjongOpponentHistoryRecord,
  MahjongOpponentRecord,
  PersonalMahjongRoomRecord,
  PersonalPokerLedgerRecord,
  PersonalSummaryResponse,
} from '@shared/api.interface';

type MyTransaction = {
  id: string;
  roomId: string;
  payerId: string;
  payeeType: string;
  payeeId: string | null;
  amount: string;
  reversalOf: string | null;
  createdAt: Date;
};

const DEFAULT_HISTORY_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE_SIZE = 50;

function normalizePage(limit?: number, offset?: number) {
  const safeLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit as number, 1), MAX_HISTORY_PAGE_SIZE)
    : DEFAULT_HISTORY_PAGE_SIZE;
  const safeOffset = Number.isInteger(offset) && (offset as number) >= 0
    ? offset as number
    : 0;
  return { safeLimit, safeOffset };
}

function toUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ProfileService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  async getSummary(userId: string): Promise<PersonalSummaryResponse> {
    const user = await this.getUser(userId);
    const [poker, mahjong, opponents] = await Promise.all([
      this.getPokerTotals(userId),
      this.getMahjongTotals(userId),
      this.getMahjongOpponents(userId),
    ]);

    return {
      user,
      totalNetProfit: fromCents(poker.netCents + mahjong.netCents),
      poker: {
        netProfit: fromCents(poker.netCents),
        gameCount: poker.gameCount,
        ledgerCount: poker.ledgerCount,
        trackedLedgerCount: poker.trackedLedgerCount,
      },
      mahjong: {
        netProfit: fromCents(mahjong.netCents),
        winTotal: fromCents(mahjong.winCents),
        lossTotal: fromCents(mahjong.lossCents),
        roomCount: mahjong.roomCount,
        opponentCount: opponents.length,
        teaFeeTotal: fromCents(mahjong.teaFeeCents),
      },
    };
  }

  async getPokerLedgers(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ ledgers: PersonalPokerLedgerRecord[]; total: number; hasMore: boolean; nextOffset: number }> {
    const { safeLimit, safeOffset } = normalizePage(limit, offset);
    const [owners, countRows] = await Promise.all([
      this.db
        .select({
          room: rooms,
          selfPlayerId: pokerLedgerOwners.selfPlayerId,
        })
        .from(pokerLedgerOwners)
        .innerJoin(rooms, eq(pokerLedgerOwners.roomId, rooms.id))
        .where(eq(pokerLedgerOwners.userId, userId))
        .orderBy(desc(rooms.updatedAt), desc(rooms.id))
        .limit(safeLimit)
        .offset(safeOffset),
      this.db
        .select({ total: count() })
        .from(pokerLedgerOwners)
        .where(eq(pokerLedgerOwners.userId, userId)),
    ]);

    const playerIds = owners
      .map((owner) => owner.selfPlayerId)
      .filter((playerId): playerId is string => Boolean(playerId));
    const rows = playerIds.length
      ? await this.db
        .select({ playerId: gamePlayers.playerId, netProfit: gamePlayers.netProfit })
        .from(gamePlayers)
        .where(inArray(gamePlayers.playerId, playerIds))
      : [];
    const totals = new Map<string, { netCents: number; gameCount: number }>();
    for (const row of rows) {
      const total = totals.get(row.playerId) ?? { netCents: 0, gameCount: 0 };
      total.netCents += toCents(row.netProfit);
      total.gameCount += 1;
      totals.set(row.playerId, total);
    }

    const ledgers = owners
      .map((owner) => {
        const total = owner.selfPlayerId
          ? totals.get(owner.selfPlayerId) ?? { netCents: 0, gameCount: 0 }
          : { netCents: 0, gameCount: 0 };
        return {
          room: {
            id: owner.room.id,
            roomCode: owner.room.roomCode,
            roomName: owner.room.roomName,
            gameType: owner.room.gameType,
            createdAt: owner.room.createdAt.toISOString(),
            updatedAt: owner.room.updatedAt.toISOString(),
          },
          selfPlayerId: owner.selfPlayerId ?? null,
          myNetProfit: fromCents(total.netCents),
          myGameCount: total.gameCount,
        };
      });
    const total = Number(countRows[0]?.total || 0);
    const nextOffset = safeOffset + ledgers.length;
    return { ledgers, total, hasMore: nextOffset < total, nextOffset };
  }

  async getMahjongRooms(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ rooms: PersonalMahjongRoomRecord[]; total: number; hasMore: boolean; nextOffset: number }> {
    const { safeLimit, safeOffset } = normalizePage(limit, offset);
    const [membershipRows, countRows] = await Promise.all([
      this.db
        .select({ room: mahjongRooms })
        .from(mahjongRoomMembers)
        .innerJoin(mahjongRooms, eq(mahjongRoomMembers.roomId, mahjongRooms.id))
        .where(eq(mahjongRoomMembers.userId, userId))
        .orderBy(desc(mahjongRooms.createdAt), desc(mahjongRooms.id))
        .limit(safeLimit)
        .offset(safeOffset),
      this.db
        .select({ total: count() })
        .from(mahjongRoomMembers)
        .where(eq(mahjongRoomMembers.userId, userId)),
    ]);
    const total = Number(countRows[0]?.total || 0);
    if (membershipRows.length === 0) {
      return { rooms: [], total, hasMore: false, nextOffset: safeOffset };
    }

    const roomIds = membershipRows.map((row) => row.room.id);
    const transactions = await this.db
      .select({
        roomId: mahjongTransactions.roomId,
        payerId: mahjongTransactions.payerId,
        payeeType: mahjongTransactions.payeeType,
        payeeId: mahjongTransactions.payeeId,
        amount: mahjongTransactions.amount,
        createdAt: mahjongTransactions.createdAt,
      })
      .from(mahjongTransactions)
      .where(inArray(mahjongTransactions.roomId, roomIds));

    const totals = new Map<string, { netCents: number; lastActivityAt: Date | null }>();
    for (const transaction of transactions) {
      const total = totals.get(transaction.roomId) ?? { netCents: 0, lastActivityAt: null };
      const amountCents = toCents(transaction.amount);
      if (transaction.payeeType === 'user') {
        if (transaction.payerId === userId) total.netCents -= amountCents;
        if (transaction.payeeId === userId) total.netCents += amountCents;
      }
      if (!total.lastActivityAt || transaction.createdAt > total.lastActivityAt) {
        total.lastActivityAt = transaction.createdAt;
      }
      totals.set(transaction.roomId, total);
    }

    const rooms = membershipRows
      .map(({ room }) => {
        const total = totals.get(room.id) ?? { netCents: 0, lastActivityAt: null };
        return {
          roomCode: room.roomCode,
          roomName: room.name,
          createdAt: room.createdAt.toISOString(),
          dissolvedAt: room.dissolvedAt ? room.dissolvedAt.toISOString() : null,
          lastActivityAt: (total.lastActivityAt ?? room.createdAt).toISOString(),
          myNetProfit: fromCents(total.netCents),
        };
      });
    const nextOffset = safeOffset + rooms.length;
    return { rooms, total, hasMore: nextOffset < total, nextOffset };
  }

  async getMahjongOpponents(userId: string): Promise<MahjongOpponentRecord[]> {
    const transactions = this.getEffectiveTransactions(await this.getMyTransactions(userId));
    const byOpponent = new Map<
      string,
      {
        netCents: number;
        winCents: number;
        lossCents: number;
        roomIds: Set<string>;
        transactionCount: number;
        lastPlayedAt: Date;
      }
    >();

    for (const transaction of transactions) {
      if (transaction.payeeType !== 'user' || !transaction.payeeId) continue;
      const opponentId = transaction.payerId === userId
        ? transaction.payeeId
        : transaction.payerId;
      const amountCents = toCents(transaction.amount);
      const netCents = transaction.payerId === userId ? -amountCents : amountCents;
      const total = byOpponent.get(opponentId) ?? {
        netCents: 0,
        winCents: 0,
        lossCents: 0,
        roomIds: new Set<string>(),
        transactionCount: 0,
        lastPlayedAt: transaction.createdAt,
      };
      total.netCents += netCents;
      if (netCents > 0) total.winCents += netCents;
      if (netCents < 0) total.lossCents += Math.abs(netCents);
      total.roomIds.add(transaction.roomId);
      total.transactionCount += 1;
      if (transaction.createdAt > total.lastPlayedAt) total.lastPlayedAt = transaction.createdAt;
      byOpponent.set(opponentId, total);
    }

    const opponentIds = Array.from(byOpponent.keys());
    if (opponentIds.length === 0) return [];
    const userRows = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, opponentIds));
    const names = new Map(userRows.map((row) => [row.id, row.name]));

    return opponentIds
      .map((userIdValue) => {
        const total = byOpponent.get(userIdValue)!;
        return {
          userId: userIdValue,
          userName: names.get(userIdValue) ?? '未知玩家',
          netProfit: fromCents(total.netCents),
          winTotal: fromCents(total.winCents),
          lossTotal: fromCents(total.lossCents),
          roomCount: total.roomIds.size,
          transactionCount: total.transactionCount,
          lastPlayedAt: total.lastPlayedAt.toISOString(),
        };
      })
      .sort((left, right) => right.lastPlayedAt.localeCompare(left.lastPlayedAt));
  }

  async getMahjongOpponentHistory(
    userId: string,
    opponentId: string,
  ): Promise<{ opponentName: string; records: MahjongOpponentHistoryRecord[] }> {
    const transactions = this.getEffectiveTransactions(await this.getMyTransactions(userId)).filter(
      (transaction) =>
        transaction.payeeType === 'user' &&
        ((transaction.payerId === userId && transaction.payeeId === opponentId) ||
          (transaction.payerId === opponentId && transaction.payeeId === userId)),
    );
    const [opponent] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, opponentId));
    if (!opponent) throw new NotFoundException('对手不存在');

    const roomIds = Array.from(new Set(transactions.map((transaction) => transaction.roomId)));
    const roomRows = roomIds.length
      ? await this.db
        .select({ id: mahjongRooms.id, roomCode: mahjongRooms.roomCode, roomName: mahjongRooms.name })
        .from(mahjongRooms)
        .where(inArray(mahjongRooms.id, roomIds))
      : [];
    const roomDetails = new Map(roomRows.map((room) => [room.id, room]));

    return {
      opponentName: opponent.name,
      records: transactions
        .map((transaction) => {
          const room = roomDetails.get(transaction.roomId);
          const amountCents = toCents(transaction.amount);
          return {
            id: transaction.id,
            roomCode: room?.roomCode ?? '',
            roomName: room?.roomName ?? '麻将房',
            amount: fromCents(Math.abs(amountCents)),
            netProfit: fromCents(transaction.payerId === userId ? -amountCents : amountCents),
            createdAt: transaction.createdAt.toISOString(),
            reversalOf: transaction.reversalOf,
          };
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  }

  private async getPokerTotals(userId: string) {
    const owners = await this.db
      .select({ selfPlayerId: pokerLedgerOwners.selfPlayerId })
      .from(pokerLedgerOwners)
      .where(eq(pokerLedgerOwners.userId, userId));
    const playerIds = owners
      .map((owner) => owner.selfPlayerId)
      .filter((playerId): playerId is string => Boolean(playerId));
    const rows = playerIds.length
      ? await this.db
        .select({ netProfit: gamePlayers.netProfit })
        .from(gamePlayers)
        .where(inArray(gamePlayers.playerId, playerIds))
      : [];
    return {
      netCents: rows.reduce((sum, row) => sum + toCents(row.netProfit), 0),
      gameCount: rows.length,
      ledgerCount: owners.length,
      trackedLedgerCount: playerIds.length,
    };
  }

  private async getMahjongTotals(userId: string) {
    const [transactions, roomRows] = await Promise.all([
      this.getMyTransactions(userId),
      this.db
        .select({ roomId: mahjongRoomMembers.roomId })
        .from(mahjongRoomMembers)
        .where(eq(mahjongRoomMembers.userId, userId)),
    ]);
    let netCents = 0;
    let winCents = 0;
    let lossCents = 0;
    let teaFeeCents = 0;
    for (const transaction of this.getEffectiveTransactions(transactions)) {
      const amountCents = toCents(transaction.amount);
      if (transaction.payeeType === 'tea_fee' && transaction.payerId === userId) {
        teaFeeCents += amountCents;
        continue;
      }
      if (transaction.payeeType !== 'user') continue;
      const delta = transaction.payerId === userId ? -amountCents : amountCents;
      netCents += delta;
      if (delta > 0) winCents += delta;
      if (delta < 0) lossCents += Math.abs(delta);
    }
    return {
      netCents,
      winCents,
      lossCents,
      teaFeeCents,
      roomCount: roomRows.length,
    };
  }

  private async getMyTransactions(userId: string): Promise<MyTransaction[]> {
    return this.db
      .select({
        id: mahjongTransactions.id,
        roomId: mahjongTransactions.roomId,
        payerId: mahjongTransactions.payerId,
        payeeType: mahjongTransactions.payeeType,
        payeeId: mahjongTransactions.payeeId,
        amount: mahjongTransactions.amount,
        reversalOf: mahjongTransactions.reversalOf,
        createdAt: mahjongTransactions.createdAt,
      })
      .from(mahjongTransactions)
      .where(
        or(
          eq(mahjongTransactions.payerId, userId),
          eq(mahjongTransactions.payeeId, userId),
        ),
      );
  }

  /** A reversal is audit data, not another win or loss. Exclude both rows. */
  private getEffectiveTransactions(transactions: MyTransaction[]): MyTransaction[] {
    const reversedOriginIds = new Set(
      transactions
        .map((transaction) => transaction.reversalOf)
        .filter((transactionId): transactionId is string => Boolean(transactionId)),
    );
    return transactions.filter(
      (transaction) => !transaction.reversalOf && !reversedOriginIds.has(transaction.id),
    );
  }

  private async getUser(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId));
    if (rows.length === 0) throw new NotFoundException('用户不存在');
    return toUser(rows[0]);
  }
}
