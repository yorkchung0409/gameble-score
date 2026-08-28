import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import { rooms, players, games, gamePlayers } from '@server/database/schema';
import { eq, desc, inArray, and, sql, sum } from 'drizzle-orm';
import type {
  Room,
  Player,
  Game,
  GamePlayer,
  RoomDetailResponse,
  CreateRoomResponse,
  CreateGameRequest,
  UpdateGameRequest,
  CreateGameResponse,
} from '@shared/api.interface';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function extractPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

function toRoom(row: typeof rooms.$inferSelect): Room {
  return {
    id: row.id,
    roomCode: row.roomCode,
    roomName: row.roomName,
    gameType: row.gameType ?? 'texas',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function toPlayer(row: typeof players.$inferSelect): Player {
  return {
    id: row.id,
    roomId: row.roomId,
    name: row.name,
  };
}

@Injectable()
export class PokerService {
  private readonly logger = new Logger(PokerService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  async createRoom(
    roomCode: string | undefined,
    roomName: string,
    gameType: string = 'texas',
  ): Promise<CreateRoomResponse> {
    if (roomCode && roomCode.length > 0) {
      const existing = await this.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.roomCode, roomCode.toUpperCase()));
      if (existing.length > 0) {
        throw new ConflictException('房间码已存在');
      }
      const [row] = await this.db
          .insert(rooms)
          .values({ roomCode: roomCode.toUpperCase(), roomName, gameType })
          .returning();
      return { room: toRoom(row) };
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const [row] = await this.db
            .insert(rooms)
            .values({ roomCode: code, roomName, gameType })
            .returning();
        return { room: toRoom(row) };
      } catch (error) {
        const pgCode = extractPostgresErrorCode(error);
        if (pgCode === '23505') {
          continue;
        }
        this.logger.error('创建房间失败', JSON.stringify(error));
        throw error;
      }
    }
    throw new ConflictException('生成唯一房间码失败，请重试');
  }

  async getRoomDetail(roomCode: string): Promise<RoomDetailResponse> {
    const roomRows = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomRow = roomRows[0];
    const room = toRoom(roomRow);

    const playerRows = await this.db
      .select()
      .from(players)
      .where(eq(players.roomId, room.id))
      .orderBy(players.name);
    const playerList: Player[] = playerRows.map((p) => toPlayer(p));

    const gameRows = await this.db
      .select()
      .from(games)
      .where(eq(games.roomId, room.id))
      .orderBy(desc(games.gameDate), desc(games.createdAt));

    const gameIdList: string[] = gameRows.map((g) => g.id);

    let gamePlayerRows: Array<{
      id: string;
      gameId: string;
      playerId: string;
      playerName: string;
      buyIn: string;
      balance: string;
      netProfit: string;
    }> = [];

    if (gameIdList.length > 0) {
      gamePlayerRows = await this.db
        .select({
          id: gamePlayers.id,
          gameId: gamePlayers.gameId,
          playerId: gamePlayers.playerId,
          playerName: players.name,
          buyIn: gamePlayers.buyIn,
          balance: gamePlayers.balance,
          netProfit: gamePlayers.netProfit,
        })
        .from(gamePlayers)
        .innerJoin(players, eq(gamePlayers.playerId, players.id))
        .where(inArray(gamePlayers.gameId, gameIdList));
    }

    const byGame = new Map<string, GamePlayer[]>();
    let totalBuyInNum = 0;
    for (const gp of gamePlayerRows) {
      const arr = byGame.get(gp.gameId) ?? [];
      arr.push(gp);
      byGame.set(gp.gameId, arr);
      totalBuyInNum += Number(gp.buyIn);
    }

    const gameList: Game[] = gameRows.map((g) => {
      const gps = byGame.get(g.id) ?? [];
      let gameBuyIn = 0;
      for (const gp of gps) {
        gameBuyIn += Number(gp.buyIn);
      }
      return {
        id: g.id,
        roomId: g.roomId,
        gameDate: g.gameDate,
        players: gps,
        totalBuyIn: String(gameBuyIn),
        playerCount: gps.length,
      };
    });

    let latestGameBalanceDiff = 0;
    let latestGameTurnover = 0;
    if (gameList.length > 0) {
      const latestPlayers = gameList[0].players;
      let netSum = 0;
      let winSum = 0;
      for (const p of latestPlayers) {
        const np = Number(p.netProfit);
        netSum += np;
        if (np > 0) winSum += np;
      }
      latestGameBalanceDiff = Math.abs(netSum);
      latestGameTurnover = winSum;
    }

    return {
      room,
      players: playerList,
      games: gameList,
      stats: {
        totalGames: gameList.length,
        totalBuyIn: String(totalBuyInNum),
        latestGameBalanceDiff: String(latestGameBalanceDiff),
        latestGameTurnover: String(latestGameTurnover),
      },
      lastUpdated: room.createdAt,
    };
  }

  private async touchRoom(roomId: string): Promise<void> {
    await this.db
      .update(rooms)
      .set({ updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
  }

  async updateRoom(roomCode: string, roomName: string): Promise<{ room: Room }> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const [updated] = await this.db
      .update(rooms)
      .set({ roomName })
      .where(eq(rooms.id, roomRows[0].id))
      .returning();
    return { room: toRoom(updated) };
  }

  async addPlayer(roomCode: string, name: string): Promise<Player> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const [row] = await this.db
      .insert(players)
      .values({ roomId: roomRows[0].id, name })
      .returning();
    await this.touchRoom(roomRows[0].id);
    return toPlayer(row);
  }

  async deletePlayer(roomCode: string, playerId: string): Promise<void> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const deleted = await this.db
      .delete(players)
      .where(and(eq(players.id, playerId), eq(players.roomId, roomRows[0].id)))
      .returning({ id: players.id });
    if (deleted.length === 0) {
      throw new NotFoundException('人员不存在');
    }
    await this.touchRoom(roomRows[0].id);
  }

  async createGame(
    roomCode: string,
    dto: CreateGameRequest,
  ): Promise<CreateGameResponse> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (!dto.players || dto.players.length === 0) {
      throw new BadRequestException('牌局至少需要一名玩家');
    }

    const roomId = roomRows[0].id;

    const result = await this.db.transaction(async (tx) => {
      const [gameRow] = await tx
        .insert(games)
        .values({ roomId, gameDate: dto.gameDate })
        .returning();

      const gpRows = await tx
        .insert(gamePlayers)
        .values(
          dto.players.map((p) => ({
            gameId: gameRow.id,
            playerId: p.playerId,
            buyIn: String(p.buyIn),
            balance: String(p.balance),
            netProfit: String(p.balance - p.buyIn),
          })),
        )
        .returning();

      const playerIds = dto.players.map((p) => p.playerId);
      const playerListRows = await tx
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(inArray(players.id, playerIds));
      const nameMap = new Map<string, string>();
      for (const pl of playerListRows) {
        nameMap.set(pl.id, pl.name);
      }

      const gamePlayerList: GamePlayer[] = gpRows.map((gp) => ({
        id: gp.id,
        gameId: gp.gameId,
        playerId: gp.playerId,
        playerName: nameMap.get(gp.playerId) ?? '',
        buyIn: gp.buyIn,
        balance: gp.balance,
        netProfit: gp.netProfit,
      }));

      let gameBuyIn = 0;
      for (const gp of gamePlayerList) {
        gameBuyIn += Number(gp.buyIn);
      }

      const game: Game = {
        id: gameRow.id,
        roomId: gameRow.roomId,
        gameDate: gameRow.gameDate,
        players: gamePlayerList,
        totalBuyIn: String(gameBuyIn),
        playerCount: gamePlayerList.length,
      };

      return { game };
    });

    return result;
  }

  async updateGame(
    roomCode: string,
    gameId: string,
    dto: UpdateGameRequest,
  ): Promise<CreateGameResponse> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomId = roomRows[0].id;

    const gameRows = await this.db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.roomId, roomId)));
    if (gameRows.length === 0) {
      throw new NotFoundException('牌局不存在');
    }

    const result = await this.db.transaction(async (tx) => {
      const patch: Partial<typeof games.$inferInsert> = {};
      if (dto.gameDate !== undefined) {
        patch.gameDate = dto.gameDate;
      }
      let gameRow = gameRows[0];
      if (Object.keys(patch).length > 0) {
        const [updated] = await tx
          .update(games)
          .set(patch)
          .where(eq(games.id, gameId))
          .returning();
        gameRow = updated;
      }

      let gamePlayerList: GamePlayer[] = [];

      if (dto.players !== undefined) {
        if (dto.players.length === 0) {
          throw new BadRequestException('牌局至少需要一名玩家');
        }
        await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId));

        const gpRows = await tx
          .insert(gamePlayers)
          .values(
            dto.players.map((p) => ({
              gameId,
              playerId: p.playerId,
              buyIn: String(p.buyIn),
              balance: String(p.balance),
              netProfit: String(p.balance - p.buyIn),
            })),
          )
          .returning();

        const playerIds = dto.players.map((p) => p.playerId);
        const playerListRows = await tx
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, playerIds));
        const nameMap = new Map<string, string>();
        for (const pl of playerListRows) {
          nameMap.set(pl.id, pl.name);
        }

        gamePlayerList = gpRows.map((gp) => ({
          id: gp.id,
          gameId: gp.gameId,
          playerId: gp.playerId,
          playerName: nameMap.get(gp.playerId) ?? '',
          buyIn: gp.buyIn,
          balance: gp.balance,
          netProfit: gp.netProfit,
        }));
      } else {
        const existingGps = await tx
          .select({
            id: gamePlayers.id,
            gameId: gamePlayers.gameId,
            playerId: gamePlayers.playerId,
            playerName: players.name,
            buyIn: gamePlayers.buyIn,
            balance: gamePlayers.balance,
            netProfit: gamePlayers.netProfit,
          })
          .from(gamePlayers)
          .innerJoin(players, eq(gamePlayers.playerId, players.id))
          .where(eq(gamePlayers.gameId, gameId));
        gamePlayerList = existingGps;
      }

      let gameBuyIn = 0;
      for (const gp of gamePlayerList) {
        gameBuyIn += Number(gp.buyIn);
      }

      const game: Game = {
        id: gameRow.id,
        roomId: gameRow.roomId,
        gameDate: gameRow.gameDate,
        players: gamePlayerList,
        totalBuyIn: String(gameBuyIn),
        playerCount: gamePlayerList.length,
      };

      return { game };
    });

    return result;
  }

  async deleteGame(roomCode: string, gameId: string): Promise<void> {
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const deleted = await this.db
      .delete(games)
      .where(and(eq(games.id, gameId), eq(games.roomId, roomRows[0].id)))
      .returning({ id: games.id });
    if (deleted.length === 0) {
      throw new NotFoundException('牌局不存在');
    }
    await this.touchRoom(roomRows[0].id);
  }
}
