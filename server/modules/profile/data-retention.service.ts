import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  gamePlayers,
  games,
  mahjongOpponentSnapshots,
  mahjongTransactions,
  mahjongUserSnapshots,
  pokerLedgerOwners,
  pokerLedgerSnapshots,
} from '@server/database/schema';
import { fromCents, toCents } from '@server/common/utils';

const DETAIL_RETENTION_MONTHS = 6;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_RUN = 10;

type UserAggregate = {
  netCents: number;
  winCents: number;
  lossCents: number;
  teaFeeCents: number;
};

type OpponentAggregate = UserAggregate & {
  userId: string;
  opponentUserId: string;
  transactionCount: number;
  roomIds: Set<string>;
};

@Injectable()
export class DataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  onModuleInit() {
    void this.runCleanup();
    this.timer = setInterval(() => void this.runCleanup(), CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCleanup() {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - DETAIL_RETENTION_MONTHS);
      const pokerCount = await this.cleanupPoker(cutoff);
      const mahjongCount = await this.cleanupMahjong(cutoff);
      if (pokerCount || mahjongCount) {
        this.logger.log(`Archived and removed old details: poker games=${pokerCount}, mahjong transactions=${mahjongCount}`);
      }
    } catch (error) {
      this.logger.error('Historical detail cleanup failed; will retry on the next run.', error);
    } finally {
      this.running = false;
    }
  }

  private async cleanupPoker(cutoff: Date): Promise<number> {
    let removed = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const count = await this.db.transaction(async (tx) => {
        const oldGames = await tx
          .select({ id: games.id, roomId: games.roomId })
          .from(games)
          .innerJoin(pokerLedgerOwners, eq(pokerLedgerOwners.roomId, games.roomId))
          .where(lt(games.createdAt, cutoff))
          .limit(BATCH_SIZE);
        if (oldGames.length === 0) return 0;

        const gameIds = oldGames.map((game) => game.id);
        const gameRoomIds = new Map(oldGames.map((game) => [game.id, game.roomId]));
        const owners = await tx
          .select({ roomId: pokerLedgerOwners.roomId, userId: pokerLedgerOwners.userId, selfPlayerId: pokerLedgerOwners.selfPlayerId })
          .from(pokerLedgerOwners)
          .where(inArray(pokerLedgerOwners.roomId, oldGames.map((game) => game.roomId)));
        const ownerByRoom = new Map(owners.map((owner) => [owner.roomId, owner]));
        const oldPlayers = await tx
          .select({ gameId: gamePlayers.gameId, playerId: gamePlayers.playerId, netProfit: gamePlayers.netProfit })
          .from(gamePlayers)
          .where(inArray(gamePlayers.gameId, gameIds));

        const totals = new Map<string, { userId: string; netCents: number; gameCount: number }>();
        for (const player of oldPlayers) {
          const roomId = gameRoomIds.get(player.gameId);
          const owner = roomId ? ownerByRoom.get(roomId) : undefined;
          if (!roomId || !owner || !owner.selfPlayerId || owner.selfPlayerId !== player.playerId) continue;
          const total = totals.get(roomId) ?? { userId: owner.userId, netCents: 0, gameCount: 0 };
          total.netCents += toCents(player.netProfit);
          total.gameCount += 1;
          totals.set(roomId, total);
        }

        for (const [roomId, total] of totals) {
          const existing = await tx
            .select({ netProfit: pokerLedgerSnapshots.netProfit, gameCount: pokerLedgerSnapshots.gameCount })
            .from(pokerLedgerSnapshots)
            .where(eq(pokerLedgerSnapshots.roomId, roomId));
          if (existing.length) {
            await tx
              .update(pokerLedgerSnapshots)
              .set({
                netProfit: fromCents(toCents(existing[0].netProfit) + total.netCents),
                gameCount: Number(existing[0].gameCount || 0) + total.gameCount,
                archivedThrough: cutoff,
              })
              .where(eq(pokerLedgerSnapshots.roomId, roomId));
          } else {
            await tx.insert(pokerLedgerSnapshots).values({
              roomId,
              userId: total.userId,
              netProfit: fromCents(total.netCents),
              gameCount: total.gameCount,
              archivedThrough: cutoff,
            });
          }
        }

        await tx.delete(games).where(inArray(games.id, gameIds));
        return oldGames.length;
      });
      removed += count;
      if (count < BATCH_SIZE) break;
    }
    return removed;
  }

  private async cleanupMahjong(cutoff: Date): Promise<number> {
    let removed = 0;
    let cursorCreatedAt: Date | null = null;
    let cursorId: string | null = null;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const result = await this.db.transaction(async (tx) => {
        const cursorCondition = cursorCreatedAt && cursorId
          ? or(
            gt(mahjongTransactions.createdAt, cursorCreatedAt),
            and(
              eq(mahjongTransactions.createdAt, cursorCreatedAt),
              gt(mahjongTransactions.id, cursorId),
            ),
          )
          : undefined;
        const candidatesQuery = tx
          .select()
          .from(mahjongTransactions)
          .where(cursorCondition
            ? and(lt(mahjongTransactions.createdAt, cutoff), cursorCondition)
            : lt(mahjongTransactions.createdAt, cutoff))
          .orderBy(asc(mahjongTransactions.createdAt), asc(mahjongTransactions.id))
          .limit(BATCH_SIZE);
        const candidates = await candidatesQuery;
        if (candidates.length === 0) return { removed: 0, hasCandidates: false };
        const lastCandidate = candidates[candidates.length - 1];
        cursorCreatedAt = lastCandidate.createdAt;
        cursorId = lastCandidate.id;

        const candidateIds = candidates.map((row) => row.id);
        const reversalRows = await tx
          .select()
          .from(mahjongTransactions)
          .where(inArray(mahjongTransactions.reversalOf, candidateIds));
        const originsToLoad = reversalRows
          .map((row) => row.reversalOf)
          .filter((id): id is string => typeof id === 'string' && !candidateIds.includes(id));
        const missingOrigins = originsToLoad.length
          ? await tx.select().from(mahjongTransactions).where(inArray(mahjongTransactions.id, originsToLoad))
          : [];
        const allRows = [...candidates, ...reversalRows, ...missingOrigins];
        const byId = new Map(allRows.map((row) => [row.id, row]));
        const reversalByOrigin = new Map(
          reversalRows
            .filter((row) => Boolean(row.reversalOf))
            .map((row) => [row.reversalOf as string, row]),
        );
        const safeIds = new Set<string>();

        for (const row of candidates) {
          if (row.reversalOf) {
            const origin = byId.get(row.reversalOf);
            if (origin && origin.createdAt < cutoff) {
              safeIds.add(row.id);
              safeIds.add(origin.id);
            }
            continue;
          }
          const reversal = reversalByOrigin.get(row.id);
          if (!reversal) {
            safeIds.add(row.id);
          } else if (reversal.createdAt < cutoff) {
            safeIds.add(row.id);
            safeIds.add(reversal.id);
          }
        }

        if (safeIds.size === 0) return { removed: 0, hasCandidates: true };
        const safeRows = Array.from(safeIds)
          .map((id) => byId.get(id))
          .filter((row): row is (typeof allRows)[number] => Boolean(row));
        const reversedOriginIds = new Set(
          safeRows
            .map((row) => row.reversalOf)
            .filter((id): id is string => Boolean(id)),
        );
        const userTotals = new Map<string, UserAggregate>();
        const opponentTotals = new Map<string, OpponentAggregate>();
        for (const row of safeRows) {
          if (row.reversalOf || reversedOriginIds.has(row.id)) continue;
          const amountCents = toCents(row.amount);
          if (row.payeeType === 'tea_fee') {
            const total = userTotals.get(row.payerId) ?? { netCents: 0, winCents: 0, lossCents: 0, teaFeeCents: 0 };
            total.teaFeeCents += amountCents;
            userTotals.set(row.payerId, total);
            continue;
          }
          if (row.payeeType !== 'user' || !row.payeeId) continue;
          this.addUserDelta(userTotals, row.payerId, -amountCents);
          this.addUserDelta(userTotals, row.payeeId, amountCents);
          this.addOpponentDelta(opponentTotals, row.payerId, row.payeeId, -amountCents, row.roomId);
          this.addOpponentDelta(opponentTotals, row.payeeId, row.payerId, amountCents, row.roomId);
        }

        for (const [userId, total] of userTotals) {
          const existing = await tx
            .select()
            .from(mahjongUserSnapshots)
            .where(eq(mahjongUserSnapshots.userId, userId));
          if (existing.length) {
            await tx
              .update(mahjongUserSnapshots)
              .set({
                netProfit: fromCents(toCents(existing[0].netProfit) + total.netCents),
                winTotal: fromCents(toCents(existing[0].winTotal) + total.winCents),
                lossTotal: fromCents(toCents(existing[0].lossTotal) + total.lossCents),
                teaFeeTotal: fromCents(toCents(existing[0].teaFeeTotal) + total.teaFeeCents),
                archivedThrough: cutoff,
              })
              .where(eq(mahjongUserSnapshots.userId, userId));
          } else {
            await tx.insert(mahjongUserSnapshots).values({
              userId,
              netProfit: fromCents(total.netCents),
              winTotal: fromCents(total.winCents),
              lossTotal: fromCents(total.lossCents),
              teaFeeTotal: fromCents(total.teaFeeCents),
              archivedThrough: cutoff,
            });
          }
        }

        for (const total of opponentTotals.values()) {
          const id = `${total.userId}:${total.opponentUserId}`;
          const existing = await tx
            .select()
            .from(mahjongOpponentSnapshots)
            .where(eq(mahjongOpponentSnapshots.id, id));
          if (existing.length) {
            await tx
              .update(mahjongOpponentSnapshots)
              .set({
                netProfit: fromCents(toCents(existing[0].netProfit) + total.netCents),
                winTotal: fromCents(toCents(existing[0].winTotal) + total.winCents),
                lossTotal: fromCents(toCents(existing[0].lossTotal) + total.lossCents),
                transactionCount: Number(existing[0].transactionCount || 0) + total.transactionCount,
                roomCount: Number(existing[0].roomCount || 0) + total.roomIds.size,
                archivedThrough: cutoff,
              })
              .where(eq(mahjongOpponentSnapshots.id, id));
          } else {
            await tx.insert(mahjongOpponentSnapshots).values({
              id,
              userId: total.userId,
              opponentUserId: total.opponentUserId,
              netProfit: fromCents(total.netCents),
              winTotal: fromCents(total.winCents),
              lossTotal: fromCents(total.lossCents),
              transactionCount: total.transactionCount,
              roomCount: total.roomIds.size,
              archivedThrough: cutoff,
            });
          }
        }

        await tx.delete(mahjongTransactions).where(inArray(mahjongTransactions.id, Array.from(safeIds)));
        return { removed: safeIds.size, hasCandidates: true };
      });
      removed += result.removed;
      if (!result.hasCandidates) break;
    }
    return removed;
  }

  private addUserDelta(totals: Map<string, UserAggregate>, userId: string, deltaCents: number) {
    const total = totals.get(userId) ?? { netCents: 0, winCents: 0, lossCents: 0, teaFeeCents: 0 };
    total.netCents += deltaCents;
    if (deltaCents > 0) total.winCents += deltaCents;
    if (deltaCents < 0) total.lossCents += Math.abs(deltaCents);
    totals.set(userId, total);
  }

  private addOpponentDelta(
    totals: Map<string, OpponentAggregate>,
    userId: string,
    opponentUserId: string,
    deltaCents: number,
    roomId: string,
  ) {
    const key = `${userId}:${opponentUserId}`;
    const total = totals.get(key) ?? {
      userId,
      opponentUserId,
      netCents: 0,
      winCents: 0,
      lossCents: 0,
      teaFeeCents: 0,
      transactionCount: 0,
      roomIds: new Set<string>(),
    };
    total.netCents += deltaCents;
    if (deltaCents > 0) total.winCents += deltaCents;
    if (deltaCents < 0) total.lossCents += Math.abs(deltaCents);
    total.transactionCount += 1;
    total.roomIds.add(roomId);
    totals.set(key, total);
  }
}
