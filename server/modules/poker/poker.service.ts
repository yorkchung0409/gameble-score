import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  generateRoomCode,
  isUniqueConstraintError,
  normalizeRoomCode,
  parseNonNegativeAmount,
  parseCalendarDate,
  toCents,
  fromCents,
} from '@server/common/utils';
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

function toRoom(row: typeof rooms.$inferSelect): Room {
  return {
    id: row.id,
    roomCode: row.roomCode,
    roomName: row.roomName,
    gameType: row.gameType ?? 'texas',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    const normalizedName = (roomName || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('房间名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('房间名称不能超过 50 个字符');
    }

    const upperCode = normalizeRoomCode(roomCode ?? '');
    if (upperCode) {
      if (upperCode.length > 50) {
        throw new BadRequestException('房间码不能超过 50 个字符');
      }
      const existing = await this.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.roomCode, upperCode));
      if (existing.length > 0) {
        throw new ConflictException('房间码已存在');
      }
      const id = randomUUID();
      await this.db
        .insert(rooms)
        .values({ id, roomCode: upperCode, roomName: normalizedName, gameType });
      const [row] = await this.db.select().from(rooms).where(eq(rooms.id, id));
      return { room: toRoom(row) };
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const id = randomUUID();
        await this.db
          .insert(rooms)
          .values({ id, roomCode: code, roomName: normalizedName, gameType });
        const [row] = await this.db.select().from(rooms).where(eq(rooms.id, id));
        return { room: toRoom(row) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
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
    let totalBuyInCents = 0;
    for (const gp of gamePlayerRows) {
      const arr = byGame.get(gp.gameId) ?? [];
      arr.push(gp);
      byGame.set(gp.gameId, arr);
      totalBuyInCents += toCents(gp.buyIn);
    }

    const gameList: Game[] = gameRows.map((g) => {
      const gps = byGame.get(g.id) ?? [];
      let gameBuyInCents = 0;
      for (const gp of gps) {
        gameBuyInCents += toCents(gp.buyIn);
      }
      return {
        id: g.id,
        roomId: g.roomId,
        gameDate: g.gameDate,
        players: gps,
        totalBuyIn: fromCents(gameBuyInCents),
        playerCount: gps.length,
      };
    });

    let latestGameBalanceDiffCents = 0;
    let latestGameTurnoverCents = 0;
    if (gameList.length > 0) {
      const latestPlayers = gameList[0].players;
      let netSumCents = 0;
      let winSumCents = 0;
      for (const p of latestPlayers) {
        const netProfitCents = toCents(p.netProfit);
        netSumCents += netProfitCents;
        if (netProfitCents > 0) winSumCents += netProfitCents;
      }
      latestGameBalanceDiffCents = Math.abs(netSumCents);
      latestGameTurnoverCents = winSumCents;
    }

    return {
      room,
      players: playerList,
      games: gameList,
      stats: {
        totalGames: gameList.length,
        totalBuyIn: fromCents(totalBuyInCents),
        latestGameBalanceDiff: fromCents(latestGameBalanceDiffCents),
        latestGameTurnover: fromCents(latestGameTurnoverCents),
      },
      lastUpdated: room.updatedAt,
    };
  }

  private async touchRoom(roomId: string): Promise<void> {
    await this.db
      .update(rooms)
      .set({ updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
  }

  async updateRoom(roomCode: string, roomName: string): Promise<{ room: Room }> {
    const normalizedName = (roomName || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('房间名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('房间名称不能超过 50 个字符');
    }
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    await this.db
      .update(rooms)
      .set({ roomName: normalizedName, updatedAt: new Date() })
      .where(eq(rooms.id, roomRows[0].id));
    const [updated] = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomRows[0].id));
    return { room: toRoom(updated) };
  }

  async addPlayer(roomCode: string, name: string): Promise<Player> {
    const normalizedName = (name || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('人员名称不能为空');
    }
    if (normalizedName.length > 100) {
      throw new BadRequestException('人员名称不能超过 100 个字符');
    }
    const roomRows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const id = randomUUID();
    await this.db
      .insert(players)
      .values({ id, roomId: roomRows[0].id, name: normalizedName });
    const [row] = await this.db.select().from(players).where(eq(players.id, id));
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
    // 该人员已有历史牌局时禁止删除，避免级联删除改写历史账目
    const historyRows = await this.db
      .select({ id: gamePlayers.id })
      .from(gamePlayers)
      .where(eq(gamePlayers.playerId, playerId));
    if (historyRows.length > 0) {
      throw new BadRequestException('该人员已有历史牌局记录，无法删除');
    }
    const targetPlayers = await this.db
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.roomId, roomRows[0].id)));
    if (targetPlayers.length === 0) {
      throw new NotFoundException('人员不存在');
    }
    await this.db
      .delete(players)
      .where(and(eq(players.id, playerId), eq(players.roomId, roomRows[0].id)));
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
    const gameDate = parseCalendarDate(dto.gameDate, '牌局日期');

    const roomId = roomRows[0].id;

    // 按玩家去重，防止同一玩家在一局中重复出现导致统计翻倍
    const uniquePlayers = Array.from(
      new Map(dto.players.map((p) => [p.playerId, p])).values(),
    );

    if (uniquePlayers.length > 100) {
      throw new BadRequestException('单局玩家数量不能超过 100');
    }
    // 校验金额非负
    for (const p of uniquePlayers) {
      parseNonNegativeAmount(p.buyIn, '买入');
      parseNonNegativeAmount(p.balance, '结余');
    }
    // 校验玩家都属于该房间（防注入不属于房间的玩家）
    const cgPlayerIds = Array.from(new Set(uniquePlayers.map((p) => p.playerId)));
    const cgRoomPlayers = await this.db
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.roomId, roomId), inArray(players.id, cgPlayerIds)));
    if (cgRoomPlayers.length !== cgPlayerIds.length) {
      throw new BadRequestException('存在不属于该房间的玩家');
    }

    const result = await this.db.transaction(async (tx) => {
      const gameId = randomUUID();
      await tx
        .insert(games)
        .values({ id: gameId, roomId, gameDate });

      const gpRows = uniquePlayers.map((p) => {
        const buyIn = parseNonNegativeAmount(p.buyIn, '买入');
        const balance = parseNonNegativeAmount(p.balance, '结余');
        return {
          id: randomUUID(),
          gameId,
          playerId: p.playerId,
          buyIn: String(buyIn),
          balance: String(balance),
          netProfit: fromCents(toCents(balance) - toCents(buyIn)),
        };
      });
      await tx.insert(gamePlayers).values(gpRows);

      const playerIds = uniquePlayers.map((p) => p.playerId);
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

      let gameBuyInCents = 0;
      for (const gp of gamePlayerList) {
        gameBuyInCents += toCents(gp.buyIn);
      }

      const game: Game = {
        id: gameId,
        roomId,
        gameDate,
        players: gamePlayerList,
        totalBuyIn: fromCents(gameBuyInCents),
        playerCount: gamePlayerList.length,
      };

      return { game };
    });

    await this.touchRoom(roomId);
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

    // 按玩家去重，防止同一玩家在一局中重复出现导致统计翻倍
    const uniquePlayers =
      dto.players !== undefined
        ? Array.from(new Map(dto.players.map((p) => [p.playerId, p])).values())
        : [];

    if (dto.players !== undefined) {
      if (uniquePlayers.length === 0) {
        throw new BadRequestException('牌局至少需要一名玩家');
      }
      if (uniquePlayers.length > 100) {
        throw new BadRequestException('单局玩家数量不能超过 100');
      }
      for (const p of uniquePlayers) {
        parseNonNegativeAmount(p.buyIn, '买入');
        parseNonNegativeAmount(p.balance, '结余');
      }
      // 校验玩家都属于该房间
      const ugPlayerIds = Array.from(new Set(uniquePlayers.map((p) => p.playerId)));
      const ugRoomPlayers = await this.db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.roomId, roomId), inArray(players.id, ugPlayerIds)));
      if (ugRoomPlayers.length !== ugPlayerIds.length) {
        throw new BadRequestException('存在不属于该房间的玩家');
      }
    }
    const gameDate =
      dto.gameDate === undefined
        ? undefined
        : parseCalendarDate(dto.gameDate, '牌局日期');

    const result = await this.db.transaction(async (tx) => {
      const patch: Partial<typeof games.$inferInsert> = {};
      if (gameDate !== undefined) {
        patch.gameDate = gameDate;
      }
      let gameRow = gameRows[0];
      if (Object.keys(patch).length > 0) {
        await tx.update(games).set(patch).where(eq(games.id, gameId));
        const [updated] = await tx.select().from(games).where(eq(games.id, gameId));
        gameRow = updated;
      }

      let gamePlayerList: GamePlayer[] = [];

      if (dto.players !== undefined) {
        await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId));

        const gpRows = uniquePlayers.map((p) => {
          const buyIn = parseNonNegativeAmount(p.buyIn, '买入');
          const balance = parseNonNegativeAmount(p.balance, '结余');
          return {
            id: randomUUID(),
            gameId,
            playerId: p.playerId,
            buyIn: String(buyIn),
            balance: String(balance),
            netProfit: fromCents(toCents(balance) - toCents(buyIn)),
          };
        });
        await tx.insert(gamePlayers).values(gpRows);

        const playerIds = uniquePlayers.map((p) => p.playerId);
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

      let gameBuyInCents = 0;
      for (const gp of gamePlayerList) {
        gameBuyInCents += toCents(gp.buyIn);
      }

      const game: Game = {
        id: gameRow.id,
        roomId: gameRow.roomId,
        gameDate: gameRow.gameDate,
        players: gamePlayerList,
        totalBuyIn: fromCents(gameBuyInCents),
        playerCount: gamePlayerList.length,
      };

      return { game };
    });

    await this.touchRoom(roomId);
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
    const targets = await this.db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.roomId, roomRows[0].id)));
    if (targets.length === 0) {
      throw new NotFoundException('牌局不存在');
    }
    await this.db
      .delete(games)
      .where(and(eq(games.id, gameId), eq(games.roomId, roomRows[0].id)));
    await this.touchRoom(roomRows[0].id);
  }
}
