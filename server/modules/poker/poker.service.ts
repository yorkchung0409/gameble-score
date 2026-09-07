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
import {
  rooms,
  players,
  games,
  gamePlayers,
  pokerLedgerOwners,
} from '@server/database/schema';
import { eq, desc, inArray, and, sql, sum, count } from 'drizzle-orm';
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
  MiniPokerLedgerDetailResponse,
  PokerLeaderboardEntry,
  UpdateMiniPokerLedgerSettingsRequest,
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

type DetailPage = { limit: number; offset: number };

@Injectable()
export class PokerService {
  private readonly logger = new Logger(PokerService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  async createRoom(
    roomCode: string | undefined,
    roomName: string,
    gameType: string = 'texas',
    ownerUserId?: string,
  ): Promise<CreateRoomResponse> {
    const normalizedName = typeof roomName === 'string' ? roomName.trim() : '';
    if (!normalizedName) {
      throw new BadRequestException('房间名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('房间名称不能超过 50 个字符');
    }
    const normalizedGameType = typeof gameType === 'string' ? gameType.trim().toLowerCase() : '';
    if (normalizedGameType !== 'texas' && normalizedGameType !== 'mahjong') {
      throw new BadRequestException('牌局类型无效');
    }

    const createWithCode = (code: string) => this.db.transaction(async (tx) => {
      const id = randomUUID();
      await tx
        .insert(rooms)
        .values({ id, roomCode: code, roomName: normalizedName, gameType: normalizedGameType });
      if (ownerUserId) {
        await tx.insert(pokerLedgerOwners).values({ roomId: id, userId: ownerUserId });
      }
      const [row] = await tx.select().from(rooms).where(eq(rooms.id, id));
      return row;
    });

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
      try {
        const row = await createWithCode(upperCode);
        return { room: toRoom(row) };
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new ConflictException('房间码已存在');
        throw error;
      }
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const row = await createWithCode(code);
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

  async getRoomDetail(
    roomCode: string,
    page?: DetailPage,
  ): Promise<RoomDetailResponse> {
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

    const gameQuery = this.db
      .select()
      .from(games)
      .where(eq(games.roomId, room.id))
      .orderBy(desc(games.gameDate), desc(games.createdAt), desc(games.id));
    const gameRows = page
      ? await gameQuery.limit(page.limit).offset(page.offset)
      : await gameQuery;

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

    let totalGames = gameList.length;
    if (page) {
      const [gameCountRow] = await this.db
        .select({ total: count(games.id) })
        .from(games)
        .where(eq(games.roomId, room.id));
      const [buyInRow] = await this.db
        .select({ total: sum(gamePlayers.buyIn) })
        .from(gamePlayers)
        .innerJoin(games, eq(gamePlayers.gameId, games.id))
        .where(eq(games.roomId, room.id));
      totalGames = Number(gameCountRow?.total ?? 0);
      totalBuyInCents = toCents(buyInRow?.total ?? '0');
    }

    let latestGameBalanceDiffCents = 0;
    let latestGameTurnoverCents = 0;
    let latestNetProfits = (gameList[0]?.players ?? []).map((player) => player.netProfit);
    if (page) {
      const [latestGame] = await this.db
        .select({ id: games.id })
        .from(games)
        .where(eq(games.roomId, room.id))
        .orderBy(desc(games.gameDate), desc(games.createdAt), desc(games.id))
        .limit(1);
      latestNetProfits = latestGame
        ? await this.db
            .select({ netProfit: gamePlayers.netProfit })
            .from(gamePlayers)
            .where(eq(gamePlayers.gameId, latestGame.id))
            .then((rows) => rows.map((row) => row.netProfit))
        : [];
    }
    if (latestNetProfits.length > 0) {
      let netSumCents = 0;
      let winSumCents = 0;
      for (const netProfit of latestNetProfits) {
        const netProfitCents = toCents(netProfit);
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
        totalGames,
        totalBuyIn: fromCents(totalBuyInCents),
        latestGameBalanceDiff: fromCents(latestGameBalanceDiffCents),
        latestGameTurnover: fromCents(latestGameTurnoverCents),
      },
      lastUpdated: room.updatedAt,
      ...(page
        ? {
            gamePage: {
              total: totalGames,
              hasMore: page.offset + gameList.length < totalGames,
              nextOffset: page.offset + gameList.length,
            },
          }
        : {}),
    };
  }

  private async touchRoom(roomId: string): Promise<void> {
    await this.db
      .update(rooms)
      .set({ updatedAt: new Date() })
      .where(eq(rooms.id, roomId));
  }

  async updateRoom(roomCode: string, roomName: string): Promise<{ room: Room }> {
    const normalizedName = typeof roomName === 'string' ? roomName.trim() : '';
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
    const normalizedName = typeof name === 'string' ? name.trim() : '';
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
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('牌局信息无效');
    }
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
    if (dto.operationId !== undefined && typeof dto.operationId !== 'string') {
      throw new BadRequestException('操作号格式无效');
    }
    const operationId = dto.operationId?.trim() || null;
    if (operationId && operationId.length > 80) {
      throw new BadRequestException('操作号不能超过 80 个字符');
    }
    if (operationId) {
      const existingOperation = await this.db
        .select({ id: games.id, roomId: games.roomId })
        .from(games)
        .where(eq(games.operationId, operationId));
      if (existingOperation.length > 0) {
        if (existingOperation[0].roomId !== roomId) {
          throw new ConflictException('操作号已被使用');
        }
        return this.getGameResponse(roomCode, existingOperation[0].id);
      }
    }

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

    let result: CreateGameResponse;
    try {
      result = await this.db.transaction(async (tx) => {
      const gameId = randomUUID();
      await tx
        .insert(games)
        .values({ id: gameId, roomId, gameDate, operationId });

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
    } catch (error) {
      if (operationId && isUniqueConstraintError(error)) {
        const existingOperation = await this.db
          .select({ id: games.id, roomId: games.roomId })
          .from(games)
          .where(eq(games.operationId, operationId));
        if (existingOperation[0]?.roomId === roomId) {
          return this.getGameResponse(roomCode, existingOperation[0].id);
        }
        throw new ConflictException('操作号已被使用');
      }
      throw error;
    }

    await this.touchRoom(roomId);
    return result;
  }

  async createPrivateRoom(
    userId: string,
    roomCode: string | undefined,
    roomName: string,
  ): Promise<CreateRoomResponse> {
    return this.createRoom(roomCode, roomName, 'texas', userId);
  }

  private async getGameResponse(roomCode: string, gameId: string): Promise<CreateGameResponse> {
    const detail = await this.getRoomDetail(roomCode);
    const game = detail.games.find((item) => item.id === gameId);
    if (!game) throw new NotFoundException('牌局不存在');
    return { game };
  }

  async getPublicRoomDetail(
    roomCode: string,
    page?: DetailPage,
  ): Promise<RoomDetailResponse> {
    await this.assertPublicRoom(roomCode);
    return this.getRoomDetail(roomCode, page);
  }

  async updatePublicRoom(roomCode: string, roomName: string): Promise<{ room: Room }> {
    await this.assertPublicRoom(roomCode);
    return this.updateRoom(roomCode, roomName);
  }

  async addPublicPlayer(roomCode: string, name: string): Promise<Player> {
    await this.assertPublicRoom(roomCode);
    return this.addPlayer(roomCode, name);
  }

  async deletePublicPlayer(roomCode: string, playerId: string): Promise<void> {
    await this.assertPublicRoom(roomCode);
    return this.deletePlayer(roomCode, playerId);
  }

  async createPublicGame(roomCode: string, dto: CreateGameRequest): Promise<CreateGameResponse> {
    await this.assertPublicRoom(roomCode);
    return this.createGame(roomCode, dto);
  }

  async updatePublicGame(
    roomCode: string,
    gameId: string,
    dto: UpdateGameRequest,
  ): Promise<CreateGameResponse> {
    await this.assertPublicRoom(roomCode);
    return this.updateGame(roomCode, gameId, dto);
  }

  async deletePublicGame(roomCode: string, gameId: string): Promise<void> {
    await this.assertPublicRoom(roomCode);
    return this.deleteGame(roomCode, gameId);
  }

  async listPrivateRooms(userId: string): Promise<
    Array<{ room: Room; selfPlayerId: string | null }>
  > {
    const rows = await this.db
      .select({
        room: rooms,
        selfPlayerId: pokerLedgerOwners.selfPlayerId,
      })
      .from(pokerLedgerOwners)
      .innerJoin(rooms, eq(pokerLedgerOwners.roomId, rooms.id))
      .where(eq(pokerLedgerOwners.userId, userId))
      .orderBy(desc(rooms.updatedAt));

    return rows.map((row) => ({
      room: toRoom(row.room),
      selfPlayerId: row.selfPlayerId ?? null,
    }));
  }

  async getPrivateRoomDetail(
    userId: string,
    roomCode: string,
    page?: DetailPage,
  ): Promise<MiniPokerLedgerDetailResponse> {
    const owner = await this.getPrivateOwner(userId, roomCode);
    const detail = await this.getRoomDetail(roomCode, page);
    return {
      ...detail,
      selfPlayerId: owner.selfPlayerId ?? null,
      leaderboard: await this.buildLeaderboard(owner.roomId),
    };
  }

  async updatePrivateRoom(
    userId: string,
    roomCode: string,
    roomName: string,
  ): Promise<{ room: Room }> {
    await this.getPrivateOwner(userId, roomCode);
    return this.updateRoom(roomCode, roomName);
  }

  async addPrivatePlayer(userId: string, roomCode: string, name: string): Promise<Player> {
    await this.getPrivateOwner(userId, roomCode);
    return this.addPlayer(roomCode, name);
  }

  async deletePrivatePlayer(
    userId: string,
    roomCode: string,
    playerId: string,
  ): Promise<void> {
    await this.getPrivateOwner(userId, roomCode);
    return this.deletePlayer(roomCode, playerId);
  }

  async createPrivateGame(
    userId: string,
    roomCode: string,
    dto: CreateGameRequest,
  ): Promise<CreateGameResponse> {
    await this.getPrivateOwner(userId, roomCode);
    return this.createGame(roomCode, dto);
  }

  async updatePrivateGame(
    userId: string,
    roomCode: string,
    gameId: string,
    dto: UpdateGameRequest,
  ): Promise<CreateGameResponse> {
    await this.getPrivateOwner(userId, roomCode);
    return this.updateGame(roomCode, gameId, dto);
  }

  async deletePrivateGame(userId: string, roomCode: string, gameId: string): Promise<void> {
    await this.getPrivateOwner(userId, roomCode);
    return this.deleteGame(roomCode, gameId);
  }

  async updatePrivateSelfPlayer(
    userId: string,
    roomCode: string,
    selfPlayerId: string | null,
  ): Promise<{ selfPlayerId: string | null }> {
    const owner = await this.getPrivateOwner(userId, roomCode);
    if (selfPlayerId) {
      const matches = await this.db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.id, selfPlayerId), eq(players.roomId, owner.roomId)));
      if (matches.length === 0) {
        throw new BadRequestException('请选择本账本内的参与者');
      }
    }
    await this.db
      .update(pokerLedgerOwners)
      .set({ selfPlayerId })
      .where(eq(pokerLedgerOwners.roomId, owner.roomId));
    return { selfPlayerId };
  }

  async updatePrivateSettings(
    userId: string,
    roomCode: string,
    dto: UpdateMiniPokerLedgerSettingsRequest,
  ): Promise<MiniPokerLedgerDetailResponse> {
    const owner = await this.getPrivateOwner(userId, roomCode);
    const normalizedName = typeof dto?.roomName === 'string' ? dto.roomName.trim() : '';
    if (!normalizedName) {
      throw new BadRequestException('账本名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('账本名称不能超过 50 个字符');
    }
    const selfPlayerId = dto.selfPlayerId ?? null;
    if (selfPlayerId !== null && typeof selfPlayerId !== 'string') {
      throw new BadRequestException('本人身份格式无效');
    }

    await this.db.transaction(async (tx) => {
      if (selfPlayerId) {
        const matches = await tx
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.id, selfPlayerId), eq(players.roomId, owner.roomId)));
        if (matches.length === 0) {
          throw new BadRequestException('请选择本账本内的参与者');
        }
      }
      await tx
        .update(rooms)
        .set({ roomName: normalizedName, updatedAt: new Date() })
        .where(eq(rooms.id, owner.roomId));
      await tx
        .update(pokerLedgerOwners)
        .set({ selfPlayerId })
        .where(eq(pokerLedgerOwners.roomId, owner.roomId));
    });

    return this.getPrivateRoomDetail(userId, roomCode);
  }

  private async getPrivateOwner(userId: string, roomCode: string) {
    const rows = await this.db
      .select({
        roomId: pokerLedgerOwners.roomId,
        selfPlayerId: pokerLedgerOwners.selfPlayerId,
      })
      .from(pokerLedgerOwners)
      .innerJoin(rooms, eq(pokerLedgerOwners.roomId, rooms.id))
      .where(
        and(
          eq(pokerLedgerOwners.userId, userId),
          eq(rooms.roomCode, roomCode.toUpperCase()),
        ),
      );
    if (rows.length === 0) {
      throw new NotFoundException('账本不存在或无访问权限');
    }
    return rows[0];
  }

  private async assertPublicRoom(roomCode: string): Promise<void> {
    const privateRows = await this.db
      .select({ roomId: pokerLedgerOwners.roomId })
      .from(pokerLedgerOwners)
      .innerJoin(rooms, eq(pokerLedgerOwners.roomId, rooms.id))
      .where(eq(rooms.roomCode, roomCode.toUpperCase()));
    if (privateRows.length > 0) {
      throw new NotFoundException('账本不存在');
    }
  }

  private async buildLeaderboard(roomId: string): Promise<PokerLeaderboardEntry[]> {
    const rows = await this.db
      .select({
        playerId: gamePlayers.playerId,
        playerName: players.name,
        netProfit: sql<string>`COALESCE(SUM(${gamePlayers.netProfit}), 0)`,
        winTotal: sql<string>`COALESCE(SUM(CASE WHEN ${gamePlayers.netProfit} > 0 THEN ${gamePlayers.netProfit} ELSE 0 END), 0)`,
        lossTotal: sql<string>`COALESCE(SUM(CASE WHEN ${gamePlayers.netProfit} < 0 THEN -${gamePlayers.netProfit} ELSE 0 END), 0)`,
        gameCount: count(gamePlayers.id),
      })
      .from(gamePlayers)
      .innerJoin(players, eq(gamePlayers.playerId, players.id))
      .innerJoin(games, eq(gamePlayers.gameId, games.id))
      .where(eq(games.roomId, roomId))
      .groupBy(gamePlayers.playerId, players.name);

    return rows
      .map((row) => ({
        playerId: row.playerId,
        playerName: row.playerName,
        netProfit: fromCents(toCents(row.netProfit)),
        winTotal: fromCents(toCents(row.winTotal)),
        lossTotal: fromCents(toCents(row.lossTotal)),
        gameCount: Number(row.gameCount || 0),
      }))
      .sort((left, right) => {
        const netDifference = toCents(right.netProfit) - toCents(left.netProfit);
        return netDifference !== 0 ? netDifference : left.playerName.localeCompare(right.playerName, 'zh-CN');
      });
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
