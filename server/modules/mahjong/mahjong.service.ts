import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import {
  generateRoomCode,
  extractPostgresErrorCode,
  normalizeRoomCode,
} from '@server/common/utils';
import {
  users,
  mahjongRooms,
  mahjongSeats,
  mahjongTransactions,
  mahjongRoomMembers,
} from '@server/database/schema';
import { eq, desc, and, inArray, max, isNull } from 'drizzle-orm';
import type {
  MahjongUser,
  CreateUserResponse,
  GetUserByDeviceResponse,
  CreateMahjongRoomResponse,
  MahjongRoomDetailResponse,
  MahjongSeat,
  MahjongRoomMember,
  MahjongTransaction,
  CreateTransactionRequest,
} from '@shared/api.interface';

// 自动解散：30 分钟无转账解散；扫描间隔 15 分钟
const DISSOLVE_SCAN_INTERVAL_MS = 15 * 60 * 1000;
const DISSOLVE_IDLE_MS = 30 * 60 * 1000;

function toMahjongUser(row: typeof users.$inferSelect): MahjongUser {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMahjongRoom(
  row: typeof mahjongRooms.$inferSelect,
): {
  id: string;
  roomCode: string;
  name: string;
  mode: 'seated' | 'free';
  creatorUserId: string | null;
  createdAt: string;
  dissolvedAt: string | null;
} {
  return {
    id: row.id,
    roomCode: row.roomCode,
    name: row.name,
    mode: row.mode === 'free' ? 'free' : 'seated',
    creatorUserId: row.creatorUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    dissolvedAt: row.dissolvedAt ? row.dissolvedAt.toISOString() : null,
  };
}

@Injectable()
export class MahjongService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MahjongService.name);

  private dissolveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  async onModuleInit(): Promise<void> {
    this.dissolveTimer = setInterval(() => {
      this.cleanupDissolvedRooms().catch((e) => {
        this.logger.error('自动解散扫描失败', JSON.stringify(e));
      });
    }, DISSOLVE_SCAN_INTERVAL_MS);
    // 启动时立即执行一次，避免首个 15 分钟窗口内堆积过期房间
    this.cleanupDissolvedRooms().catch((e) => {
      this.logger.error('初始自动解散扫描失败', JSON.stringify(e));
    });
  }

  onModuleDestroy(): void {
    if (this.dissolveTimer) {
      clearInterval(this.dissolveTimer);
      this.dissolveTimer = null;
    }
  }

  /** 扫描并归档超过 30 分钟无转账的麻将房（归档：仅标记解散，数据保留） */
  private async cleanupDissolvedRooms(): Promise<void> {
    const now = Date.now();
    const activeRooms = await this.db
      .select({ id: mahjongRooms.id, createdAt: mahjongRooms.createdAt })
      .from(mahjongRooms)
      .where(isNull(mahjongRooms.dissolvedAt));
    if (activeRooms.length === 0) return;

    const roomIds = activeRooms.map((r) => r.id);
    const txRows = await this.db
      .select({
        roomId: mahjongTransactions.roomId,
        lastTxAt: max(mahjongTransactions.createdAt),
      })
      .from(mahjongTransactions)
      .where(inArray(mahjongTransactions.roomId, roomIds))
      .groupBy(mahjongTransactions.roomId);

    const lastTxMap = new Map<string, Date>();
    for (const r of txRows) {
      if (r.lastTxAt) lastTxMap.set(r.roomId, new Date(r.lastTxAt));
    }

    const toDissolve: string[] = [];
    for (const rm of activeRooms) {
      const lastTx = lastTxMap.get(rm.id);
      const lastActivity = lastTx
        ? lastTx.getTime()
        : new Date(rm.createdAt).getTime();
      if (now - lastActivity > DISSOLVE_IDLE_MS) {
        toDissolve.push(rm.id);
      }
    }

    if (toDissolve.length > 0) {
      await this.db
        .update(mahjongRooms)
        .set({ dissolvedAt: new Date() })
        .where(inArray(mahjongRooms.id, toDissolve));
      this.logger.log(`自动解散 ${toDissolve.length} 个麻将房间`);
    }
  }

  // ---------- 用户相关 ----------

  async createUser(name: string, deviceId: string): Promise<CreateUserResponse> {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      throw new BadRequestException('用户名不能为空');
    }
    if (trimmedName.length > 30) {
      throw new BadRequestException('用户名不能超过 30 个字符');
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
        .values({ name: trimmedName, deviceId: deviceId.trim() })
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
    creatorUserId?: string,
  ): Promise<CreateMahjongRoomResponse> {
    const normalizedName = (name || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('房间名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('房间名称不能超过 50 个字符');
    }

    if (roomCode && roomCode.length > 0) {
      const upperCode = normalizeRoomCode(roomCode);
      const existing = await this.db
        .select({ id: mahjongRooms.id })
        .from(mahjongRooms)
        .where(eq(mahjongRooms.roomCode, upperCode));
      if (existing.length > 0) {
        throw new ConflictException('房间码已存在');
      }
      const [row] = await this.db
        .insert(mahjongRooms)
        .values({
          roomCode: upperCode,
          name: normalizedName,
          mode: 'free',
          creatorUserId: creatorUserId ?? null,
        })
        .returning();
      if (creatorUserId) {
        await this.addMember(row.id, creatorUserId);
      }
      return { room: toMahjongRoom(row) };
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const [row] = await this.db
          .insert(mahjongRooms)
          .values({
            roomCode: code,
            name: normalizedName,
            mode: 'free',
            creatorUserId: creatorUserId ?? null,
          })
          .returning();
        if (creatorUserId) {
          await this.addMember(row.id, creatorUserId);
        }
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
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
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

    // 房间成员（进房即登记），成员姓名并入 userNameMap
    const memberRows = await this.db
      .select()
      .from(mahjongRoomMembers)
      .where(eq(mahjongRoomMembers.roomId, roomId))
      .orderBy(mahjongRoomMembers.joinedAt);
    const missingMemberUserIds: string[] = [];
    for (const m of memberRows) {
      if (!userNameMap.has(m.userId)) {
        missingMemberUserIds.push(m.userId);
      }
    }
    if (missingMemberUserIds.length > 0) {
      const memberUsers = await this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, missingMemberUserIds));
      for (const u of memberUsers) {
        userNameMap.set(u.id, u.name);
      }
    }
    const members: MahjongRoomMember[] = memberRows.map((m) => ({
      userId: m.userId,
      userName: userNameMap.get(m.userId) ?? '',
      joinedAt: m.joinedAt.toISOString(),
    }));

    const transactions: MahjongTransaction[] = txRows.map((tx) => ({
      id: tx.id,
      payerId: tx.payerId,
      payerName: userNameMap.get(tx.payerId) ?? '',
      payeeType: tx.payeeType as 'user' | 'tea_fee',
      payeeId: tx.payeeId ?? null,
      payeeName: tx.payeeId ? userNameMap.get(tx.payeeId) ?? '' : null,
      amount: tx.amount,
      remark: tx.remark ?? null,
      reversalOf: tx.reversalOf ?? null,
      createdAt: tx.createdAt.toISOString(),
    }));

    // 计算 stats
    // 收集所有有转账记录的用户（付款方 + 用户类型收款方），无论当前是否入座
    const txUserIdsSet = new Set<string>();
    for (const tx of txRows) {
      txUserIdsSet.add(tx.payerId);
      if (tx.payeeType === 'user' && tx.payeeId) {
        txUserIdsSet.add(tx.payeeId);
      }
    }

    // 每个有转账记录的用户余额 = 收款总额 - 付款总额
    const balanceMap = new Map<string, number>();
    for (const uid of txUserIdsSet) {
      balanceMap.set(uid, 0);
    }

    let teaFeeTotalNum = 0;
    let totalTurnoverNum = 0;

    for (const tx of txRows) {
      const amt = Number(tx.amount);
      totalTurnoverNum += Math.abs(amt);

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

    // 所有有转账记录的玩家都展示，按余额绝对值降序
    const balances = Array.from(txUserIdsSet)
      .map((uid) => ({
        userId: uid,
        userName: userNameMap.get(uid) ?? '',
        balance: String(balanceMap.get(uid) ?? 0),
      }))
      .sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)));

    // balanceCheck: 所有用户余额之和 + 茶费 = 0 则 balanced
    const sumBalances = balances.reduce(
      (acc: number, b: { balance: string }) => acc + Number(b.balance),
      0,
    );
    const balanceCheck = sumBalances + teaFeeTotalNum === 0 ? 'balanced' : 'unbalanced';

    return {
      room,
      seats,
      members,
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
      .select({ id: mahjongRooms.id, dissolvedAt: mahjongRooms.dissolvedAt })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
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
      .select({ id: mahjongRooms.id, dissolvedAt: mahjongRooms.dissolvedAt })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
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

  // ---------- 成员 / 模式相关 ----------

  /** 进入房间即登记为成员（幂等） */
  async joinRoom(
    roomCode: string,
    userId: string,
  ): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select({ id: mahjongRooms.id, dissolvedAt: mahjongRooms.dissolvedAt })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
    }
    const roomId = roomRows[0].id;

    const userRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));
    if (userRows.length === 0) {
      throw new BadRequestException('用户不存在');
    }

    await this.addMember(roomId, userId);
    return this.getRoomDetail(roomCode);
  }

  /** 房主切换房间模式 */
  async updateMode(
    roomCode: string,
    mode: 'seated' | 'free',
    operatorUserId: string,
  ): Promise<MahjongRoomDetailResponse> {
    if (mode !== 'seated' && mode !== 'free') {
      throw new BadRequestException('模式无效');
    }
    const roomRows = await this.db
      .select({
        id: mahjongRooms.id,
        creatorUserId: mahjongRooms.creatorUserId,
        dissolvedAt: mahjongRooms.dissolvedAt,
      })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
    }
    const roomRow = roomRows[0];

    // 只有房主能切换模式
    if (!roomRow.creatorUserId || roomRow.creatorUserId !== operatorUserId) {
      throw new ForbiddenException('只有房主可以切换房间模式');
    }

    // 坐下模式 -> 普通模式：需所有玩家离座
    if (mode === 'free') {
      const seatedCount = await this.db
        .select({ id: mahjongSeats.id })
        .from(mahjongSeats)
        .where(eq(mahjongSeats.roomId, roomRow.id));
      if (seatedCount.length > 0) {
        throw new BadRequestException(
          '有玩家正在座位上，需全部离座后才能切换为普通模式',
        );
      }
    }

    await this.db
      .update(mahjongRooms)
      .set({ mode })
      .where(eq(mahjongRooms.id, roomRow.id));

    return this.getRoomDetail(roomCode);
  }

  /** 退出房间：从成员与座位移除，历史转账与余额保留（重新进入自动接上） */
  async leaveRoom(
    roomCode: string,
    userId: string,
  ): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select({ id: mahjongRooms.id, dissolvedAt: mahjongRooms.dissolvedAt })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
    }
    const roomId = roomRows[0].id;

    await this.db
      .delete(mahjongSeats)
      .where(and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, userId)));
    await this.db
      .delete(mahjongRoomMembers)
      .where(
        and(
          eq(mahjongRoomMembers.roomId, roomId),
          eq(mahjongRoomMembers.userId, userId),
        ),
      );

    return this.getRoomDetail(roomCode);
  }

  /** 幂等登记房间成员 */
  private async addMember(roomId: string, userId: string): Promise<void> {
    try {
      await this.db
        .insert(mahjongRoomMembers)
        .values({ roomId, userId })
        .onConflictDoNothing();
    } catch (error) {
      this.logger.debug('加入成员幂等处理', JSON.stringify(error));
    }
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
      .select({
        id: mahjongRooms.id,
        mode: mahjongRooms.mode,
        dissolvedAt: mahjongRooms.dissolvedAt,
      })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
    }
    const roomId = roomRows[0].id;
    const roomMode = roomRows[0].mode === 'free' ? 'free' : 'seated';

    const payerSeat =
      (await this.db
        .select({ id: mahjongSeats.id })
        .from(mahjongSeats)
        .where(
          and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, dto.payerId)),
        )).length > 0;

    if (roomMode === 'seated') {
      // 坐下模式：付款方必须在座位上
      if (!payerSeat) {
        throw new BadRequestException('付款方不在当前房间座位上');
      }
    } else {
      // 普通模式：付款方必须是房间成员，且只能以自己身份操作
      if (dto.operatorUserId !== dto.payerId) {
        throw new ForbiddenException('普通模式下只能以自己身份转账');
      }
      const payerMember =
        (await this.db
          .select({ id: mahjongRoomMembers.id })
          .from(mahjongRoomMembers)
          .where(
            and(
              eq(mahjongRoomMembers.roomId, roomId),
              eq(mahjongRoomMembers.userId, dto.payerId),
            ),
          )).length > 0;
      if (!payerMember) {
        throw new BadRequestException('付款方不是本房间成员');
      }
    }

    let payeeIdValue: string | null = null;

    if (dto.payeeType === 'user') {
      if (!dto.payeeId) {
        throw new BadRequestException('用户类型收款方必须指定 payeeId');
      }
      if (dto.payeeId === dto.payerId) {
        throw new BadRequestException('付款方和收款方不能是同一人');
      }
      if (roomMode === 'seated') {
        // 坐下模式：收款方必须在座位上
        const payeeSeat = await this.db
          .select({ id: mahjongSeats.id })
          .from(mahjongSeats)
          .where(
            and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, dto.payeeId)),
          );
        if (payeeSeat.length === 0) {
          throw new BadRequestException('收款方不在当前房间座位上');
        }
      } else {
        // 普通模式：收款方必须是房间成员
        const payeeMember =
          (await this.db
            .select({ id: mahjongRoomMembers.id })
            .from(mahjongRoomMembers)
            .where(
              and(
                eq(mahjongRoomMembers.roomId, roomId),
                eq(mahjongRoomMembers.userId, dto.payeeId),
              ),
            )).length > 0;
        if (!payeeMember) {
          throw new BadRequestException('收款方不是本房间成员');
        }
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

  /**
   * 冲正一笔转账记录：不物理删除，而是新增一条反向记录，保证流水完整可追溯。
   * 仅允许付款方本人冲正自己发起的转账。
   */
  async reverseTransaction(
    roomCode: string,
    transactionId: string,
    operatorUserId: string,
  ): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select({ id: mahjongRooms.id, dissolvedAt: mahjongRooms.dissolvedAt })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    if (roomRows[0].dissolvedAt) {
      throw new BadRequestException('房间已解散');
    }
    const roomId = roomRows[0].id;

    // 查询被冲正的原始记录
    const originRows = await this.db
      .select({
        id: mahjongTransactions.id,
        payerId: mahjongTransactions.payerId,
        payeeType: mahjongTransactions.payeeType,
        payeeId: mahjongTransactions.payeeId,
        amount: mahjongTransactions.amount,
        remark: mahjongTransactions.remark,
        reversalOf: mahjongTransactions.reversalOf,
      })
      .from(mahjongTransactions)
      .where(
        and(
          eq(mahjongTransactions.id, transactionId),
          eq(mahjongTransactions.roomId, roomId),
        ),
      );
    if (originRows.length === 0) {
      throw new NotFoundException('转账记录不存在');
    }
    const origin = originRows[0];

    // 权限校验：只有初始付款方本人才能冲正
    if (origin.payerId !== operatorUserId) {
      throw new ForbiddenException('只能冲正自己付款的转账记录');
    }

    // 禁止冲正“冲正记录”本身
    if (origin.reversalOf) {
      throw new BadRequestException('不能冲正一笔冲正记录');
    }

    // 该记录已被冲正时禁止重复冲正
    const reversedRows = await this.db
      .select({ id: mahjongTransactions.id })
      .from(mahjongTransactions)
      .where(eq(mahjongTransactions.reversalOf, transactionId));
    if (reversedRows.length > 0) {
      throw new BadRequestException('该记录已被冲正，不能重复冲正');
    }

    // 构造冲正记录
    let reversePayerId = operatorUserId;
    let reversePayeeType: string = origin.payeeType;
    let reversePayeeId: string | null = null;
    let reverseAmount: string;

    if (origin.payeeType === 'tea_fee') {
      // 茶水费是虚拟账户，无法换向，用负数金额表示从茶水费退回
      reversePayerId = origin.payerId;
      reversePayeeType = 'tea_fee';
      reversePayeeId = null;
      reverseAmount = String(-Number(origin.amount));
    } else {
      // 用户间转账：付款方与收款方互换
      reversePayerId = origin.payeeId ?? origin.payerId;
      reversePayeeType = 'user';
      reversePayeeId = origin.payerId;
      reverseAmount = origin.amount;
    }

    const originRemark = origin.remark ? `（${origin.remark}）` : '';

    await this.db.insert(mahjongTransactions).values({
      roomId,
      payerId: reversePayerId,
      payeeType: reversePayeeType,
      payeeId: reversePayeeId,
      amount: reverseAmount,
      remark: `【冲正】${originRemark}`,
      reversalOf: origin.id,
    });

    return this.getRoomDetail(roomCode);
  }
}
