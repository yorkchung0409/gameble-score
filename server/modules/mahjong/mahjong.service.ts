import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  users,
  mahjongRooms,
  mahjongSeats,
  mahjongTransactions,
} from '@server/database/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import type {
  MahjongUser,
  CreateUserResponse,
  GetUserByDeviceResponse,
  CreateMahjongRoomResponse,
  MahjongRoomDetailResponse,
  MahjongSeat,
  MahjongTransaction,
  CreateTransactionRequest,
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

function toMahjongUser(row: typeof users.$inferSelect): MahjongUser {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMahjongRoom(
  row: typeof mahjongRooms.$inferSelect,
): { id: string; roomCode: string; name: string; createdAt: string } {
  return {
    id: row.id,
    roomCode: row.roomCode,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MahjongService {
  private readonly logger = new Logger(MahjongService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  // ---------- 用户相关 ----------

  async createUser(name: string, deviceId: string): Promise<CreateUserResponse> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('用户名不能为空');
    }
    if (!deviceId || deviceId.trim().length === 0) {
      throw new BadRequestException('设备ID不能为空');
    }

    // 先按 deviceId 查，幂等：已存在则返回已有用户
    const existingByDevice = await this.db
      .select()
      .from(users)
      .where(eq(users.deviceId, deviceId));
    if (existingByDevice.length > 0) {
      return { user: toMahjongUser(existingByDevice[0]) };
    }

    // 检查 name 是否重复
    const existingByName = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, name));
    if (existingByName.length > 0) {
      throw new ConflictException('用户名已存在');
    }

    try {
      const [row] = await this.db
        .insert(users)
        .values({ name, deviceId })
        .returning();
      return { user: toMahjongUser(row) };
    } catch (error) {
      const pgCode = extractPostgresErrorCode(error);
      if (pgCode === '23505') {
        // 并发场景下 deviceId 冲突，返回已有用户
        const existing = await this.db
          .select()
          .from(users)
          .where(eq(users.deviceId, deviceId));
        if (existing.length > 0) {
          return { user: toMahjongUser(existing[0]) };
        }
        // name 冲突
        throw new ConflictException('用户名已存在');
      }
      this.logger.error('创建用户失败', JSON.stringify(error));
      throw error;
    }
  }

  async getUserByDevice(deviceId: string): Promise<GetUserByDeviceResponse> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.deviceId, deviceId));
    if (rows.length === 0) {
      return { user: null };
    }
    return { user: toMahjongUser(rows[0]) };
  }

  // ---------- 房间相关 ----------

  async createRoom(
    roomCode: string | undefined,
    name: string,
  ): Promise<CreateMahjongRoomResponse> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('房间名称不能为空');
    }

    if (roomCode && roomCode.length > 0) {
      const upperCode = roomCode.toUpperCase();
      const existing = await this.db
        .select({ id: mahjongRooms.id })
        .from(mahjongRooms)
        .where(eq(mahjongRooms.roomCode, upperCode));
      if (existing.length > 0) {
        throw new ConflictException('房间码已存在');
      }
      const [row] = await this.db
        .insert(mahjongRooms)
        .values({ roomCode: upperCode, name })
        .returning();
      return { room: toMahjongRoom(row) };
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const [row] = await this.db
          .insert(mahjongRooms)
          .values({ roomCode: code, name })
          .returning();
        return { room: toMahjongRoom(row) };
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

  // ---------- 房间详情（核心方法） ----------

  async getRoomDetail(roomCode: string): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select()
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomRow = roomRows[0];
    const room = toMahjongRoom(roomRow);
    const roomId = roomRow.id;

    // 座位（按 seat_index 升序）
    const seatRows = await this.db
      .select()
      .from(mahjongSeats)
      .where(eq(mahjongSeats.roomId, roomId))
      .orderBy(mahjongSeats.seatIndex);

    const seatUserIds: string[] = seatRows.map((s) => s.userId);

    // 用户信息
    const userRows =
      seatUserIds.length > 0
        ? await this.db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, seatUserIds))
        : [];
    const userNameMap = new Map<string, string>();
    for (const u of userRows) {
      userNameMap.set(u.id, u.name);
    }

    const seats: MahjongSeat[] = seatRows.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      userName: userNameMap.get(s.userId) ?? '',
      joinedAt: s.joinedAt.toISOString(),
    }));

    // 交易记录（按创建时间倒序）
    const txRows = await this.db
      .select()
      .from(mahjongTransactions)
      .where(eq(mahjongTransactions.roomId, roomId))
      .orderBy(desc(mahjongTransactions.createdAt));

    // 收集所有 payerId 和 payeeId 用于查用户名
    const txUserIds = new Set<string>();
    for (const tx of txRows) {
      txUserIds.add(tx.payerId);
      if (tx.payeeId) txUserIds.add(tx.payeeId);
    }
    // 合并座位用户之外的交易相关用户
    for (const uid of txUserIds) {
      if (!userNameMap.has(uid)) {
        userNameMap.set(uid, ''); // 占位，后面批量查
      }
    }
    const missingUserIds: string[] = [];
    for (const uid of txUserIds) {
      if (seatUserIds.indexOf(uid) === -1) {
        missingUserIds.push(uid);
      }
    }
    if (missingUserIds.length > 0) {
      const moreUsers = await this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, missingUserIds));
      for (const u of moreUsers) {
        userNameMap.set(u.id, u.name);
      }
    }

    const transactions: MahjongTransaction[] = txRows.map((tx) => ({
      id: tx.id,
      payerId: tx.payerId,
      payerName: userNameMap.get(tx.payerId) ?? '',
      payeeType: tx.payeeType as 'user' | 'tea_fee',
      payeeId: tx.payeeId ?? null,
      payeeName: tx.payeeId ? userNameMap.get(tx.payeeId) ?? '' : null,
      amount: tx.amount,
      remark: tx.remark ?? null,
      createdAt: tx.createdAt.toISOString(),
    }));

    // 计算 stats
    // 每个座位用户的余额 = 收款总额 - 付款总额
    const balanceMap = new Map<string, number>();
    for (const s of seatRows) {
      balanceMap.set(s.userId, 0);
    }

    let teaFeeTotalNum = 0;
    let totalTurnoverNum = 0;

    for (const tx of txRows) {
      const amt = Number(tx.amount);
      totalTurnoverNum += amt;

      if (tx.payeeType === 'tea_fee') {
        teaFeeTotalNum += amt;
      } else if (tx.payeeType === 'user' && tx.payeeId) {
        if (balanceMap.has(tx.payeeId)) {
          balanceMap.set(tx.payeeId, balanceMap.get(tx.payeeId)! + amt);
        }
      }

      if (balanceMap.has(tx.payerId)) {
        balanceMap.set(tx.payerId, balanceMap.get(tx.payerId)! - amt);
      }
    }

    const balances = seatRows.map((s) => ({
      userId: s.userId,
      userName: userNameMap.get(s.userId) ?? '',
      balance: String(balanceMap.get(s.userId) ?? 0),
    }));

    // balanceCheck: 所有座位用户余额之和 + 茶费 = 0 则 balanced
    const sumBalances = balances.reduce(
      (acc: number, b: { balance: string }) => acc + Number(b.balance),
      0,
    );
    const balanceCheck = sumBalances + teaFeeTotalNum === 0 ? 'balanced' : 'unbalanced';

    return {
      room,
      seats,
      transactions,
      stats: {
        balances,
        teaFeeTotal: String(teaFeeTotalNum),
        totalTurnover: String(totalTurnoverNum),
        balanceCheck,
      },
    };
  }

  // ---------- 座位相关 ----------

  async sitDown(
    roomCode: string,
    userId: string,
    seatIndex: number,
  ): Promise<MahjongRoomDetailResponse> {
    if (seatIndex < 0 || seatIndex > 3) {
      throw new BadRequestException('座位号必须在 0-3 之间');
    }

    const roomRows = await this.db
      .select({ id: mahjongRooms.id })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomId = roomRows[0].id;

    // 校验用户存在
    const userRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));
    if (userRows.length === 0) {
      throw new BadRequestException('用户不存在');
    }

    // 检查座位是否已被占
    const seatTaken = await this.db
      .select({ id: mahjongSeats.id })
      .from(mahjongSeats)
      .where(
        and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.seatIndex, seatIndex)),
      );
    if (seatTaken.length > 0) {
      throw new ConflictException('该座位已被占用');
    }

    // 检查用户是否已在其他座位
    const userSeated = await this.db
      .select({ id: mahjongSeats.id })
      .from(mahjongSeats)
      .where(and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, userId)));
    if (userSeated.length > 0) {
      throw new ConflictException('用户已在其他座位就座');
    }

    try {
      await this.db
        .insert(mahjongSeats)
        .values({ roomId, seatIndex, userId })
        .returning();
    } catch (error) {
      const pgCode = extractPostgresErrorCode(error);
      if (pgCode === '23505') {
        throw new ConflictException('该座位已被占用或用户已就座');
      }
      this.logger.error('坐下失败', JSON.stringify(error));
      throw error;
    }

    return this.getRoomDetail(roomCode);
  }

  async leaveSeat(
    roomCode: string,
    userId: string,
  ): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select({ id: mahjongRooms.id })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomId = roomRows[0].id;

    const deleted = await this.db
      .delete(mahjongSeats)
      .where(
        and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, userId)),
      )
      .returning({ id: mahjongSeats.id });

    if (deleted.length === 0) {
      // 用户未就座，静默返回房间详情
    }

    return this.getRoomDetail(roomCode);
  }

  // ---------- 转账记录相关 ----------

  async createTransaction(
    roomCode: string,
    dto: CreateTransactionRequest,
  ): Promise<MahjongRoomDetailResponse> {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('转账金额必须大于 0');
    }
    if (dto.payeeType !== 'user' && dto.payeeType !== 'tea_fee') {
      throw new BadRequestException('收款方类型无效');
    }

    const roomRows = await this.db
      .select({ id: mahjongRooms.id })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomId = roomRows[0].id;

    // 校验付款方必须是座位上的人
    const payerSeat = await this.db
      .select({ id: mahjongSeats.id })
      .from(mahjongSeats)
      .where(
        and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, dto.payerId)),
      );
    if (payerSeat.length === 0) {
      throw new BadRequestException('付款方不在当前房间座位上');
    }

    let payeeIdValue: string | null = null;

    if (dto.payeeType === 'user') {
      if (!dto.payeeId) {
        throw new BadRequestException('用户类型收款方必须指定 payeeId');
      }
      if (dto.payeeId === dto.payerId) {
        throw new BadRequestException('付款方和收款方不能是同一人');
      }
      // 校验收款方必须是座位上的人
      const payeeSeat = await this.db
        .select({ id: mahjongSeats.id })
        .from(mahjongSeats)
        .where(
          and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, dto.payeeId)),
        );
      if (payeeSeat.length === 0) {
        throw new BadRequestException('收款方不在当前房间座位上');
      }
      payeeIdValue = dto.payeeId;
    }

    await this.db.insert(mahjongTransactions).values({
      roomId,
      payerId: dto.payerId,
      payeeType: dto.payeeType,
      payeeId: payeeIdValue,
      amount: String(dto.amount),
      remark: dto.remark,
    });

    return this.getRoomDetail(roomCode);
  }

  async deleteTransaction(
    roomCode: string,
    transactionId: string,
  ): Promise<void> {
    const roomRows = await this.db
      .select({ id: mahjongRooms.id })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, roomCode.toUpperCase()));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomId = roomRows[0].id;

    const deleted = await this.db
      .delete(mahjongTransactions)
      .where(
        and(
          eq(mahjongTransactions.id, transactionId),
          eq(mahjongTransactions.roomId, roomId),
        ),
      )
      .returning({ id: mahjongTransactions.id });

    if (deleted.length === 0) {
      throw new NotFoundException('转账记录不存在');
    }
  }
}
