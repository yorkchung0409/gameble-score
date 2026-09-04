import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import { MahjongRealtimeService } from './mahjong-realtime.service';
import {
  generateRoomCode,
  isUniqueConstraintError,
  normalizeRoomCode,
  parseNonNegativeAmount,
  toCents,
  fromCents,
} from '@server/common/utils';
import {
  users,
  mahjongRooms,
  mahjongSeats,
  mahjongTransactions,
  mahjongRoomMembers,
  userIdentities,
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
  WeChatMiniProgramLoginResponse,
} from '@shared/api.interface';

// 自动解散：30 分钟无转账解散；扫描间隔 5 分钟
const DISSOLVE_SCAN_INTERVAL_MS = 5 * 60 * 1000;
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

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DbType,
    private readonly realtime: MahjongRealtimeService,
  ) {}

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
      .select({
        id: mahjongRooms.id,
        roomCode: mahjongRooms.roomCode,
        createdAt: mahjongRooms.createdAt,
      })
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
    const dissolvedRoomCodes: string[] = [];
    for (const rm of activeRooms) {
      const lastTx = lastTxMap.get(rm.id);
      const lastActivity = lastTx
        ? lastTx.getTime()
        : new Date(rm.createdAt).getTime();
      if (now - lastActivity > DISSOLVE_IDLE_MS) {
        toDissolve.push(rm.id);
        dissolvedRoomCodes.push(rm.roomCode);
      }
    }

    if (toDissolve.length > 0) {
      await this.db
        .update(mahjongRooms)
        .set({ dissolvedAt: new Date() })
        .where(inArray(mahjongRooms.id, toDissolve));
      for (const roomCode of dissolvedRoomCodes) {
        this.realtime.broadcast(roomCode, 'dissolved');
      }
      this.logger.log(`自动解散 ${toDissolve.length} 个麻将房间`);
    }
  }

  // ---------- 用户相关 ----------

  async createUser(name: string, deviceId: string): Promise<CreateUserResponse> {
    const trimmedName = (name || '').trim();
    const normalizedDeviceId = (deviceId || '').trim();
    if (!trimmedName) {
      throw new BadRequestException('用户名不能为空');
    }
    if (trimmedName.length > 30) {
      throw new BadRequestException('用户名不能超过 30 个字符');
    }
    if (!normalizedDeviceId) {
      throw new BadRequestException('设备ID不能为空');
    }

    // 先按 deviceId 查，幂等：已存在则返回已有用户
    const existingByDevice = await this.db
      .select()
      .from(users)
      .where(eq(users.deviceId, normalizedDeviceId));
    if (existingByDevice.length > 0) {
      return { user: toMahjongUser(existingByDevice[0]) };
    }

    // 检查 name 是否重复
    const existingByName = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, trimmedName));
    if (existingByName.length > 0) {
      throw new ConflictException('用户名已存在');
    }

    try {
      const id = randomUUID();
      await this.db
        .insert(users)
        .values({ id, name: trimmedName, deviceId: normalizedDeviceId });
      const [row] = await this.db.select().from(users).where(eq(users.id, id));
      await this.addIdentity(row.id, 'web_device', normalizedDeviceId);
      return { user: toMahjongUser(row) };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // 并发场景下 deviceId 冲突，返回已有用户
        const existing = await this.db
          .select()
          .from(users)
          .where(eq(users.deviceId, normalizedDeviceId));
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
    const normalizedDeviceId = (deviceId || '').trim();
    if (!normalizedDeviceId) {
      return { user: null };
    }
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.deviceId, normalizedDeviceId));
    if (rows.length === 0) {
      return { user: null };
    }
    return { user: toMahjongUser(rows[0]) };
  }

  /**
   * CloudBase private calls carry the Mini Program's OpenID in a trusted
   * gateway header. This avoids sending an AppSecret to the runtime entirely.
   */
  async loginWithWeChatOpenId(
    openId: string,
  ): Promise<WeChatMiniProgramLoginResponse> {
    const normalizedOpenId = this.normalizeWeChatOpenId(openId);
    return this.findOrCreateWeChatUser(normalizedOpenId);
  }

  async getUserIdByWeChatOpenId(openId: string): Promise<string> {
    const normalizedOpenId = this.normalizeWeChatOpenId(openId);
    const user = await this.findUserByIdentity('wechat_mini', normalizedOpenId);
    if (!user) {
      throw new UnauthorizedException('请先完成微信登录');
    }
    return user.id;
  }

  /**
   * Public deployments may still use wx.login + jscode2session. CloudBase
   * private calls use loginWithWeChatOpenId instead and do not need AppSecret.
   */
  async loginWithWeChatCode(
    code: string | undefined,
  ): Promise<WeChatMiniProgramLoginResponse> {
    const normalizedCode = (code || '').trim();
    if (!normalizedCode || normalizedCode.length > 512) {
      throw new BadRequestException('微信登录凭证无效');
    }

    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    if (!appId || !appSecret) {
      throw new BadRequestException('微信小程序登录尚未配置');
    }

    const query = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: normalizedCode,
      grant_type: 'authorization_code',
    });
    let payload: { openid?: unknown; errcode?: unknown; errmsg?: unknown };
    try {
      const response = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`,
      );
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      this.logger.error('微信登录请求失败', error instanceof Error ? error.message : String(error));
      throw new BadRequestException('微信登录服务暂不可用，请稍后重试');
    }

    if (typeof payload.openid !== 'string' || payload.openid.length === 0) {
      this.logger.warn(`微信登录被拒绝: ${String(payload.errcode ?? payload.errmsg ?? 'unknown')}`);
      throw new BadRequestException('微信登录失败，请重新进入小程序');
    }

    return this.loginWithWeChatOpenId(payload.openid);
  }

  private normalizeWeChatOpenId(openId: string): string {
    const normalizedOpenId = (openId || '').trim();
    if (!normalizedOpenId || normalizedOpenId.length > 128) {
      throw new BadRequestException('微信身份信息无效');
    }
    return normalizedOpenId;
  }

  private async findOrCreateWeChatUser(
    openId: string,
  ): Promise<WeChatMiniProgramLoginResponse> {
    const existing = await this.findUserByIdentity('wechat_mini', openId);
    if (existing) {
      return { user: toMahjongUser(existing), isNewUser: false };
    }

    // 保留 device_id 的非空约束以兼容现有数据库；真实身份以 user_identities 为准。
    const id = randomUUID();
    await this.db
      .insert(users)
      .values({ id, name: '微信用户', deviceId: `wx:${openId}` });
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    try {
      await this.addIdentity(user.id, 'wechat_mini', openId);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const concurrentUser = await this.findUserByIdentity('wechat_mini', openId);
        if (concurrentUser) {
          return { user: toMahjongUser(concurrentUser), isNewUser: false };
        }
      }
      throw error;
    }
    return { user: toMahjongUser(user), isNewUser: true };
  }

  async updateUserName(userId: string, name: string): Promise<CreateUserResponse> {
    const normalizedName = (name || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('用户名不能为空');
    }
    if (normalizedName.length > 30) {
      throw new BadRequestException('用户名不能超过 30 个字符');
    }
    await this.db
      .update(users)
      .set({ name: normalizedName })
      .where(eq(users.id, userId));
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return { user: toMahjongUser(user) };
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

    const upperCode = normalizeRoomCode(roomCode ?? '');
    if (upperCode) {
      if (upperCode.length > 50) {
        throw new BadRequestException('房间码不能超过 50 个字符');
      }
      const existing = await this.db
        .select({ id: mahjongRooms.id })
        .from(mahjongRooms)
        .where(eq(mahjongRooms.roomCode, upperCode));
      if (existing.length > 0) {
        throw new ConflictException('房间码已存在');
      }
      if (creatorUserId) {
        await this.assertUserExists(creatorUserId);
      }
      const id = randomUUID();
      await this.db
        .insert(mahjongRooms)
        .values({
          id,
          roomCode: upperCode,
          name: normalizedName,
          mode: 'free',
          creatorUserId: creatorUserId ?? null,
        });
      const [row] = await this.db
        .select()
        .from(mahjongRooms)
        .where(eq(mahjongRooms.id, id));
      if (creatorUserId) {
        await this.addMember(row.id, creatorUserId);
      }
      return { room: toMahjongRoom(row) };
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        if (creatorUserId) {
          await this.assertUserExists(creatorUserId);
        }
        const id = randomUUID();
        await this.db
          .insert(mahjongRooms)
          .values({
            id,
            roomCode: code,
            name: normalizedName,
            mode: 'free',
            creatorUserId: creatorUserId ?? null,
          });
        const [row] = await this.db
          .select()
          .from(mahjongRooms)
          .where(eq(mahjongRooms.id, id));
        if (creatorUserId) {
          await this.addMember(row.id, creatorUserId);
        }
        return { room: toMahjongRoom(row) };
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

  // ---------- 房间详情（核心方法） ----------

  async getRoomDetail(roomCode: string): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select()
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomRow = await this.dissolveRoomIfIdle(roomRows[0]);
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

    let teaFeeTotalCents = 0;
    let totalTurnoverCents = 0;

    for (const tx of txRows) {
      const amountCents = toCents(tx.amount);
      totalTurnoverCents += Math.abs(amountCents);

      if (tx.payeeType === 'tea_fee') {
        teaFeeTotalCents += amountCents;
      } else if (tx.payeeType === 'user' && tx.payeeId) {
        if (balanceMap.has(tx.payeeId)) {
          balanceMap.set(tx.payeeId, balanceMap.get(tx.payeeId)! + amountCents);
        }
      }

      if (balanceMap.has(tx.payerId)) {
        balanceMap.set(tx.payerId, balanceMap.get(tx.payerId)! - amountCents);
      }
    }

    // 所有有转账记录的玩家都展示，按余额绝对值降序
    const balances = Array.from(txUserIdsSet)
      .map((uid) => ({
        userId: uid,
        userName: userNameMap.get(uid) ?? '',
        balance: fromCents(balanceMap.get(uid) ?? 0),
      }))
      .sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)));

    // balanceCheck: 所有用户余额之和 + 茶费 = 0 则 balanced
    const sumBalances = balances.reduce(
      (acc: number, b: { balance: string }) => acc + toCents(b.balance),
      0,
    );
    const balanceCheck = sumBalances + teaFeeTotalCents === 0 ? 'balanced' : 'unbalanced';

    return {
      room,
      seats,
      members,
      transactions,
      stats: {
        balances,
        teaFeeTotal: fromCents(teaFeeTotalCents),
        totalTurnover: fromCents(totalTurnoverCents),
        balanceCheck,
      },
    };
  }

  /**
   * The periodic scanner is the normal path, but a room can be opened between
   * scans. Check the requested room on demand so an expired room is archived
   * immediately instead of appearing active until the next timer tick.
   */
  private async dissolveRoomIfIdle(
    roomRow: typeof mahjongRooms.$inferSelect,
  ): Promise<typeof mahjongRooms.$inferSelect> {
    if (roomRow.dissolvedAt) return roomRow;

    const [latest] = await this.db
      .select({ lastTxAt: max(mahjongTransactions.createdAt) })
      .from(mahjongTransactions)
      .where(eq(mahjongTransactions.roomId, roomRow.id));
    const lastActivityAt = latest?.lastTxAt
      ? new Date(latest.lastTxAt).getTime()
      : roomRow.createdAt.getTime();
    if (Date.now() - lastActivityAt <= DISSOLVE_IDLE_MS) return roomRow;

    const dissolvedAt = new Date();
    await this.db
      .update(mahjongRooms)
      .set({ dissolvedAt })
      .where(and(eq(mahjongRooms.id, roomRow.id), isNull(mahjongRooms.dissolvedAt)));
    this.realtime.broadcast(roomRow.roomCode, 'dissolved');
    return { ...roomRow, dissolvedAt };
  }

  // ---------- 座位相关 ----------

  async sitDown(
    roomCode: string,
    userId: string,
    seatIndex: number,
  ): Promise<MahjongRoomDetailResponse> {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 3) {
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
        .values({ id: randomUUID(), roomId, seatIndex, userId });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('该座位已被占用或用户已就座');
      }
      this.logger.error('坐下失败', JSON.stringify(error));
      throw error;
    }

    this.realtime.broadcast(roomCode, 'seat');
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

    await this.db
      .delete(mahjongSeats)
      .where(
        and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, userId)),
      );

    this.realtime.broadcast(roomCode, 'seat');
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
    this.realtime.broadcast(roomCode, 'joined');
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

    this.realtime.broadcast(roomCode, 'mode');
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

    this.realtime.broadcast(roomCode, 'left');
    return this.getRoomDetail(roomCode);
  }

  /** 幂等登记房间成员 */
  private async addMember(roomId: string, userId: string): Promise<void> {
    const existing = await this.db
      .select({ id: mahjongRoomMembers.id })
      .from(mahjongRoomMembers)
      .where(
        and(
          eq(mahjongRoomMembers.roomId, roomId),
          eq(mahjongRoomMembers.userId, userId),
        ),
      );
    if (existing.length > 0) return;
    try {
      await this.db
        .insert(mahjongRoomMembers)
        .values({ id: randomUUID(), roomId, userId });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));
    if (rows.length === 0) {
      throw new BadRequestException('用户不存在');
    }
  }

  private async addIdentity(
    userId: string,
    provider: 'web_device' | 'wechat_mini',
    providerSubject: string,
  ): Promise<void> {
    await this.db.insert(userIdentities).values({
      id: randomUUID(),
      userId,
      provider,
      providerSubject,
    });
  }

  private async findUserByIdentity(
    provider: 'web_device' | 'wechat_mini',
    providerSubject: string,
  ): Promise<typeof users.$inferSelect | null> {
    const rows = await this.db
      .select({ user: users })
      .from(userIdentities)
      .innerJoin(users, eq(userIdentities.userId, users.id))
      .where(
        and(
          eq(userIdentities.provider, provider),
          eq(userIdentities.providerSubject, providerSubject),
        ),
      );
    return rows[0]?.user ?? null;
  }

  // ---------- 转账记录相关 ----------

  async createTransaction(
    roomCode: string,
    dto: CreateTransactionRequest,
  ): Promise<MahjongRoomDetailResponse> {
    const amount = parseNonNegativeAmount(dto.amount, '转账金额');
    if (amount <= 0) {
      throw new BadRequestException('转账金额必须大于 0');
    }
    if (dto.payeeType !== 'user' && dto.payeeType !== 'tea_fee') {
      throw new BadRequestException('收款方类型无效');
    }
    if (
      dto.remark !== undefined &&
      (typeof dto.remark !== 'string' || dto.remark.length > 500)
    ) {
      throw new BadRequestException('备注不能超过 500 个字符');
    }
    if (dto.operatorUserId !== dto.payerId) {
      throw new ForbiddenException('只能以自己的身份创建转账');
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
      id: randomUUID(),
      roomId,
      payerId: dto.payerId,
      payeeType: dto.payeeType,
      payeeId: payeeIdValue,
      amount: fromCents(toCents(amount)),
      remark: dto.remark,
    });

    this.realtime.broadcast(roomCode, 'transaction');
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

    try {
      await this.db.insert(mahjongTransactions).values({
        id: randomUUID(),
        roomId,
        payerId: reversePayerId,
        payeeType: reversePayeeType,
        payeeId: reversePayeeId,
        amount: reverseAmount,
        remark: `【冲正】${originRemark}`,
        reversalOf: origin.id,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BadRequestException('该记录已被冲正，不能重复冲正');
      }
      throw error;
    }

    this.realtime.broadcast(roomCode, 'reversed');
    return this.getRoomDetail(roomCode);
  }
}
