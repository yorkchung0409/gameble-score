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
import { calculatePerPlayerTeaFeeCents, calculateThresholdTeaFeeCents, calculateRoomStats, canViewRoom, centsToAmount } from './tea-fee';
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
  mahjongTeaFeeRules,
  userIdentities,
} from '@server/database/schema';
import { eq, desc, and, inArray, max, isNull, sql, count } from 'drizzle-orm';
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
  MahjongTeaFeeMode,
  MahjongTeaFeeRule,
  UpdateMahjongTeaFeeRuleRequest,
  WeChatMiniProgramLoginResponse,
} from '@shared/api.interface';

// 自动解散：30 分钟无转账解散；后台扫描间隔 15 分钟，打开房间时会即时检查
const DISSOLVE_SCAN_INTERVAL_MS = 15 * 60 * 1000;
const DISSOLVE_IDLE_MS = 30 * 60 * 1000;
const INITIAL_DISSOLVE_SCAN_DELAY_MS = 30 * 1000;

type DetailPage = { limit: number; offset: number };

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

function defaultTeaFeeRule(): MahjongTeaFeeRule {
  return {
    enabled: false,
    mode: 'percentage',
    thresholdAmount: '0.00',
    ratePercent: 10,
    feeAmount: '0.00',
    version: 0,
    updatedAt: null,
  };
}

function normalizeTeaFeeMode(value: unknown): MahjongTeaFeeMode {
  return value === 'threshold' || value === 'shared_total' ? 'threshold' : 'percentage';
}

function calculateTransactionTeaFeeCents(
  transaction: Pick<typeof mahjongTransactions.$inferSelect, 'amount' | 'transactionType' | 'autoFeeMode' | 'autoFeeThresholdAmount' | 'autoFeeRatePercent' | 'autoFeeAmount'>,
): number {
  if (transaction.transactionType !== 'manual' || !transaction.autoFeeMode || transaction.autoFeeThresholdAmount === null) return 0;
  if ((transaction.autoFeeMode === 'percentage' || transaction.autoFeeMode === 'per_player') && transaction.autoFeeRatePercent !== null) {
    return calculatePerPlayerTeaFeeCents(
      toCents(transaction.amount),
      toCents(transaction.autoFeeThresholdAmount),
      Number(transaction.autoFeeRatePercent),
    );
  }
  if ((transaction.autoFeeMode === 'threshold' || transaction.autoFeeMode === 'shared_total') && transaction.autoFeeAmount !== null) {
    return calculateThresholdTeaFeeCents(
      toCents(transaction.amount),
      toCents(transaction.autoFeeThresholdAmount),
      toCents(transaction.autoFeeAmount),
    );
  }
  return 0;
}

function toMahjongTeaFeeRule(
  row: typeof mahjongTeaFeeRules.$inferSelect | undefined,
): MahjongTeaFeeRule {
  if (!row) return defaultTeaFeeRule();
  return {
    enabled: Boolean(row.enabled),
    mode: normalizeTeaFeeMode(row.mode),
    thresholdAmount: row.thresholdAmount,
    ratePercent: Number(row.ratePercent),
    feeAmount: row.feeAmount,
    version: Number(row.version),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

@Injectable()
export class MahjongService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MahjongService.name);

  private dissolveTimer: ReturnType<typeof setInterval> | null = null;
  private initialDissolveTimer: ReturnType<typeof setTimeout> | null = null;
  private dissolveScanInProgress = false;

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
    this.dissolveTimer.unref?.();
    // 冷启动先对外提供服务，归档扫描稍后异步执行，不阻塞首位用户。
    this.initialDissolveTimer = setTimeout(() => {
      this.cleanupDissolvedRooms().catch((e) => {
        this.logger.error('初始自动解散扫描失败', JSON.stringify(e));
      });
    }, INITIAL_DISSOLVE_SCAN_DELAY_MS);
    this.initialDissolveTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.initialDissolveTimer) {
      clearTimeout(this.initialDissolveTimer);
      this.initialDissolveTimer = null;
    }
    if (this.dissolveTimer) {
      clearInterval(this.dissolveTimer);
      this.dissolveTimer = null;
    }
  }

  /** 扫描并归档超过 30 分钟无转账的麻将房（归档：仅标记解散，数据保留） */
  private async cleanupDissolvedRooms(): Promise<void> {
    // Prevent a slow database scan from overlapping the next timer tick.
    if (this.dissolveScanInProgress) return;
    this.dissolveScanInProgress = true;
    try {
      const cutoff = new Date(Date.now() - DISSOLVE_IDLE_MS);
      const staleRooms = await this.db
        .select({
          id: mahjongRooms.id,
          roomCode: mahjongRooms.roomCode,
        })
        .from(mahjongRooms)
        .leftJoin(
          mahjongTransactions,
          eq(mahjongTransactions.roomId, mahjongRooms.id),
        )
        .where(isNull(mahjongRooms.dissolvedAt))
        .groupBy(mahjongRooms.id, mahjongRooms.roomCode, mahjongRooms.createdAt)
        .having(
          sql`COALESCE(MAX(${mahjongTransactions.createdAt}), ${mahjongRooms.createdAt}) < ${cutoff}`,
        );
      if (staleRooms.length === 0) return;

      const toDissolve = staleRooms.map((room) => room.id);
      const dissolvedAt = new Date();
      // The null check makes this update idempotent across service instances.
      await this.db
        .update(mahjongRooms)
        .set({ dissolvedAt })
        .where(
          and(
            isNull(mahjongRooms.dissolvedAt),
            inArray(mahjongRooms.id, toDissolve),
          ),
        );
      // Only the instance that won the conditional update broadcasts the event.
      const dissolvedRooms = await this.db
        .select({ roomCode: mahjongRooms.roomCode })
        .from(mahjongRooms)
        .where(
          and(
            eq(mahjongRooms.dissolvedAt, dissolvedAt),
            inArray(mahjongRooms.id, toDissolve),
          ),
        );
      for (const room of dissolvedRooms) {
        this.realtime.broadcast(room.roomCode, 'dissolved');
      }
      if (dissolvedRooms.length > 0) {
        this.logger.log(`自动解散 ${dissolvedRooms.length} 个麻将房间`);
      }
    } finally {
      this.dissolveScanInProgress = false;
    }
  }

  // ---------- 用户相关 ----------

  private async generateDefaultUserName(db: Pick<DbType, 'select'> = this.db): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const suffix = String(1000 + Math.floor(Math.random() * 9000));
      const name = `微信用户${suffix}`;
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, name))
        .limit(1);
      if (existing.length === 0) return name;
    }
    throw new ConflictException('暂时无法生成可用的默认昵称，请重试');
  }

  async createUser(name: string, deviceId: string): Promise<CreateUserResponse> {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
    if (!trimmedName) {
      throw new BadRequestException('用户名不能为空');
    }
    if (trimmedName.length > 30) {
      throw new BadRequestException('用户名不能超过 30 个字符');
    }
    if (!normalizedDeviceId) {
      throw new BadRequestException('设备ID不能为空');
    }
    if (normalizedDeviceId.length > 100) {
      throw new BadRequestException('设备ID不能超过 100 个字符');
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
      const row = await this.db.transaction(async (tx) => {
        await tx
          .insert(users)
          .values({ id, name: trimmedName, deviceId: normalizedDeviceId });
        await tx.insert(userIdentities).values({
          id: randomUUID(),
          userId: id,
          provider: 'web_device',
          providerSubject: normalizedDeviceId,
        });
        const [created] = await tx.select().from(users).where(eq(users.id, id));
        return created;
      });
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
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
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
    try {
      return await this.db.transaction(async (tx) => {
        const identityRows = await tx
          .select({ user: users })
          .from(userIdentities)
          .innerJoin(users, eq(userIdentities.userId, users.id))
          .where(
            and(
              eq(userIdentities.provider, 'wechat_mini'),
              eq(userIdentities.providerSubject, openId),
            ),
          );
        if (identityRows[0]) {
          return { user: toMahjongUser(identityRows[0].user), isNewUser: false };
        }

        // 兼容旧版本可能遗留的“用户已创建但身份关系未创建”数据。
        const deviceId = `wx:${openId}`;
        let [user] = await tx.select().from(users).where(eq(users.deviceId, deviceId));
        const isNewUser = !user;
        if (!user) {
          const id = randomUUID();
          const defaultName = await this.generateDefaultUserName(tx);
          await tx.insert(users).values({ id, name: defaultName, deviceId });
          [user] = await tx.select().from(users).where(eq(users.id, id));
        }
        await tx.insert(userIdentities).values({
          id: randomUUID(),
          userId: user.id,
          provider: 'wechat_mini',
          providerSubject: openId,
        });
        return { user: toMahjongUser(user), isNewUser };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const concurrentUser = await this.findUserByIdentity('wechat_mini', openId);
        if (concurrentUser) {
          return { user: toMahjongUser(concurrentUser), isNewUser: false };
        }
      }
      throw error;
    }
  }

  async updateUserName(userId: string, name: string): Promise<CreateUserResponse> {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new BadRequestException('用户名不能为空');
    }
    if (normalizedName.length > 30) {
      throw new BadRequestException('用户名不能超过 30 个字符');
    }
    const duplicate = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.name, normalizedName), sql`${users.id} <> ${userId}`))
      .limit(1);
    if (duplicate.length > 0) {
      throw new ConflictException('昵称已被使用，请换一个');
    }
    try {
      await this.db
        .update(users)
        .set({ name: normalizedName })
        .where(eq(users.id, userId));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('昵称已被使用，请换一个');
      }
      throw error;
    }
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
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      throw new BadRequestException('房间名称不能为空');
    }
    if (normalizedName.length > 50) {
      throw new BadRequestException('房间名称不能超过 50 个字符');
    }
    if (creatorUserId) {
      await this.assertUserExists(creatorUserId);
    }

    const createWithCode = (code: string) => this.db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.insert(mahjongRooms).values({
        id,
        roomCode: code,
        name: normalizedName,
        mode: 'free',
        creatorUserId: creatorUserId ?? null,
      });
      if (creatorUserId) {
        await tx.insert(mahjongRoomMembers).values({
          id: randomUUID(),
          roomId: id,
          userId: creatorUserId,
        });
      }
      const [row] = await tx.select().from(mahjongRooms).where(eq(mahjongRooms.id, id));
      return row;
    });

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
      try {
        const row = await createWithCode(upperCode);
        return { room: toMahjongRoom(row) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException('房间码已存在');
        }
        throw error;
      }
    }

    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = generateRoomCode();
      try {
        const row = await createWithCode(code);
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

  async getRoomDetail(
    roomCode: string,
    page?: DetailPage,
    viewerUserId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const roomRows = await this.db
      .select()
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) {
      throw new NotFoundException('房间不存在');
    }
    const roomRow = await this.dissolveRoomIfIdle(roomRows[0]);
    const teaFeeRule = await this.getTeaFeeRule(roomRow.id);
    const room = Object.assign(toMahjongRoom(roomRow), { teaFeeRule });
    const roomId = roomRow.id;
    if (viewerUserId) await this.assertRoomViewer(roomId, viewerUserId, Boolean(roomRow.dissolvedAt));

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

    // 交易记录按页读取；统计只选取必要字段，避免把完整流水全部搬进应用内存。
    const txQuery = this.db
      .select()
      .from(mahjongTransactions)
      .where(eq(mahjongTransactions.roomId, roomId))
      .orderBy(desc(mahjongTransactions.createdAt), desc(mahjongTransactions.id));
    const txRows = page
      ? await txQuery.limit(page.limit).offset(page.offset)
      : await txQuery;
    const statsTxRows = page
      ? await this.db
          .select({
            id: mahjongTransactions.id,
            payerId: mahjongTransactions.payerId,
            payeeType: mahjongTransactions.payeeType,
            payeeId: mahjongTransactions.payeeId,
            amount: mahjongTransactions.amount,
            reversalOf: mahjongTransactions.reversalOf,
            transactionType: mahjongTransactions.transactionType,
            autoFeeMode: mahjongTransactions.autoFeeMode,
            autoFeeThresholdAmount: mahjongTransactions.autoFeeThresholdAmount,
            autoFeeRatePercent: mahjongTransactions.autoFeeRatePercent,
            autoFeeAmount: mahjongTransactions.autoFeeAmount,
          })
          .from(mahjongTransactions)
          .where(eq(mahjongTransactions.roomId, roomId))
      : txRows;

    // 收集所有 payerId 和 payeeId 用于查用户名
    const txUserIds = new Set<string>();
    for (const tx of [...txRows, ...statsTxRows]) {
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
      .where(
        and(
          eq(mahjongRoomMembers.roomId, roomId),
          isNull(mahjongRoomMembers.leftAt),
        ),
      )
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

    const transactions: MahjongTransaction[] = txRows.map((tx) => {
      const autoFeeAmountCents = tx.payeeType === 'user'
        ? calculateTransactionTeaFeeCents(tx)
        : 0;
      return {
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
        transactionType: tx.transactionType === 'auto_tea_fee_adjustment'
          ? 'auto_tea_fee_adjustment'
          : 'manual',
        autoFeeRuleVersion: tx.autoFeeRuleVersion ?? null,
        teaFeeAmount: autoFeeAmountCents > 0 ? fromCents(autoFeeAmountCents) : null,
      };
    });

    // The cloud function and Cloud Hosting use this same domain calculation.
    const stats = calculateRoomStats(statsTxRows);
    const balances = Array.from(stats.balanceMap.entries())
      .map(([userId, cents]) => ({
        userId,
        userName: userNameMap.get(userId) ?? '',
        balance: centsToAmount(cents),
      }))
      .sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)));
    const sumBalances = Array.from(stats.balanceMap.values()).reduce((total, cents) => total + cents, 0);
    const balanceCheck = sumBalances + stats.teaFeeTotal === 0 ? 'balanced' : 'unbalanced';

    const transactionPage = page
      ? await this.getTransactionPage(roomId, page, txRows.length)
      : undefined;
    return {
      room,
      seats,
      members,
      transactions,
      ...(transactionPage ? { transactionPage } : {}),
      stats: {
        balances,
        teaFeeTotal: centsToAmount(stats.teaFeeTotal),
        totalTurnover: centsToAmount(stats.totalTurnover),
        balanceCheck,
      },
    };
  }

  private async getTransactionPage(
    roomId: string,
    page: DetailPage,
    returnedCount: number,
  ): Promise<{ total: number; hasMore: boolean; nextOffset: number }> {
    const [row] = await this.db
      .select({ total: count(mahjongTransactions.id) })
      .from(mahjongTransactions)
      .where(eq(mahjongTransactions.roomId, roomId));
    const total = Number(row?.total ?? 0);
    const nextOffset = page.offset + returnedCount;
    return { total, hasMore: nextOffset < total, nextOffset };
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
    await this.assertActiveMember(roomId, userId);

    const userSeated = await this.db
      .select({ id: mahjongSeats.id, seatIndex: mahjongSeats.seatIndex })
      .from(mahjongSeats)
      .where(and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, userId)));
    if (userSeated[0]?.seatIndex === seatIndex) {
      return this.getRoomDetail(roomCode);
    }

    // 检查目标座位是否已被占
    const seatTaken = await this.db
      .select({ id: mahjongSeats.id })
      .from(mahjongSeats)
      .where(
        and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.seatIndex, seatIndex)),
      );
    if (seatTaken.length > 0) {
      throw new ConflictException('该座位已被占用');
    }

    try {
      if (userSeated.length > 0) {
        await this.db
          .update(mahjongSeats)
          .set({ seatIndex })
          .where(eq(mahjongSeats.id, userSeated[0].id));
      } else {
        await this.db
          .insert(mahjongSeats)
          .values({ id: randomUUID(), roomId, seatIndex, userId });
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('该座位刚刚被其他玩家占用');
      }
      this.logger.error('入座或换座失败', JSON.stringify(error));
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

    await this.assertActiveMember(roomId, userId);

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

    const membershipChanged = await this.addMember(roomId, userId);
    if (membershipChanged) this.realtime.broadcast(roomCode, 'joined');
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

  private async getTeaFeeRule(roomId: string): Promise<MahjongTeaFeeRule> {
    const rows = await this.db
      .select()
      .from(mahjongTeaFeeRules)
      .where(eq(mahjongTeaFeeRules.roomId, roomId));
    return toMahjongTeaFeeRule(rows[0]);
  }

  /** 房主配置自动茶水费。每笔转账按保存时的规则快照结算。 */
  async updateTeaFeeRule(
    roomCode: string,
    dto: UpdateMahjongTeaFeeRuleRequest,
  ): Promise<MahjongRoomDetailResponse> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('茶水费规则无效');
    }
    if (typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('自动茶水费开关无效');
    }
    const inputMode = String(dto.mode || '');
    if (!['percentage', 'threshold', 'per_player', 'shared_total'].includes(inputMode)) {
      throw new BadRequestException('茶水费模式无效');
    }
    const mode = normalizeTeaFeeMode(inputMode);
    const threshold = parseNonNegativeAmount(dto.thresholdAmount, '满额金额');
    const ratePercent = Number(dto.ratePercent);
    if (!Number.isInteger(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      throw new BadRequestException('抽成比例必须是 0 到 100 的整数');
    }
    const feeAmount = parseNonNegativeAmount(dto.feeAmount ?? 0, '抽水金额');
    if (dto.enabled && mode === 'threshold' && threshold <= 0) {
      throw new BadRequestException('满额金额必须大于 0');
    }
    if (dto.enabled && mode === 'threshold' && feeAmount <= 0) {
      throw new BadRequestException('抽水金额必须大于 0');
    }
    if (!dto.operatorUserId || typeof dto.operatorUserId !== 'string') {
      throw new ForbiddenException('缺少操作用户');
    }

    const roomRows = await this.db
      .select({
        id: mahjongRooms.id,
        creatorUserId: mahjongRooms.creatorUserId,
        dissolvedAt: mahjongRooms.dissolvedAt,
      })
      .from(mahjongRooms)
      .where(eq(mahjongRooms.roomCode, normalizeRoomCode(roomCode)));
    if (roomRows.length === 0) throw new NotFoundException('房间不存在');
    const roomRow = roomRows[0];
    if (roomRow.dissolvedAt) throw new BadRequestException('房间已解散');
    if (!roomRow.creatorUserId || roomRow.creatorUserId !== dto.operatorUserId) {
      throw new ForbiddenException('只有房主可以设置自动茶水费');
    }

    const existingRows = await this.db
      .select({ version: mahjongTeaFeeRules.version })
      .from(mahjongTeaFeeRules)
      .where(eq(mahjongTeaFeeRules.roomId, roomRow.id));
    const nextVersion = Number(existingRows[0]?.version || 0) + 1;
    const values = {
      roomId: roomRow.id,
      enabled: dto.enabled ? 1 : 0,
      mode,
      thresholdAmount: mode === 'threshold' ? fromCents(toCents(threshold)) : '0.00',
      ratePercent: mode === 'percentage' ? ratePercent : 0,
      feeAmount: mode === 'threshold' ? fromCents(toCents(feeAmount)) : '0.00',
      version: nextVersion,
      updatedAt: new Date(),
    };
    if (existingRows.length === 0) {
      await this.db.insert(mahjongTeaFeeRules).values(values);
    } else {
      await this.db
        .update(mahjongTeaFeeRules)
        .set(values)
        .where(eq(mahjongTeaFeeRules.roomId, roomRow.id));
    }

    this.realtime.broadcast(roomCode, 'tea_fee_rule');
    return this.getRoomDetail(roomCode);
  }

  /** 退出房间：离开当前成员列表，但保留历史参与关系与余额。 */
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
      .update(mahjongRoomMembers)
      .set({ leftAt: new Date() })
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
  private async addMember(roomId: string, userId: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: mahjongRoomMembers.id, leftAt: mahjongRoomMembers.leftAt })
      .from(mahjongRoomMembers)
      .where(
        and(
          eq(mahjongRoomMembers.roomId, roomId),
          eq(mahjongRoomMembers.userId, userId),
        ),
      );
    if (existing.length > 0) {
      if (!existing[0].leftAt) return false;
      await this.db
        .update(mahjongRoomMembers)
        .set({ joinedAt: new Date(), leftAt: null })
        .where(eq(mahjongRoomMembers.id, existing[0].id));
      return true;
    }
    try {
      await this.db
        .insert(mahjongRoomMembers)
        .values({ id: randomUUID(), roomId, userId });
      return true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return false;
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

  private async assertActiveMember(roomId: string, userId: string): Promise<void> {
    const rows = await this.db
      .select({ id: mahjongRoomMembers.id })
      .from(mahjongRoomMembers)
      .where(
        and(
          eq(mahjongRoomMembers.roomId, roomId),
          eq(mahjongRoomMembers.userId, userId),
          isNull(mahjongRoomMembers.leftAt),
        ),
      );
    if (rows.length === 0) {
      throw new BadRequestException('请先加入房间');
    }
  }

  private async assertRoomViewer(
    roomId: string,
    userId: string,
    isArchived: boolean,
  ): Promise<void> {
    const rows = await this.db
      .select({ id: mahjongRoomMembers.id })
      .from(mahjongRoomMembers)
      .where(
        isArchived
          ? and(
              eq(mahjongRoomMembers.roomId, roomId),
              eq(mahjongRoomMembers.userId, userId),
            )
          : and(
              eq(mahjongRoomMembers.roomId, roomId),
              eq(mahjongRoomMembers.userId, userId),
              isNull(mahjongRoomMembers.leftAt),
            ),
      )
      .limit(1);
    const isMember = rows.length > 0;
    if (!canViewRoom({ isArchived, isActiveMember: isMember, wasMember: isMember })) {
      throw new ForbiddenException('请先加入房间');
    }
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
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('转账信息无效');
    }
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
    if (dto.operationId !== undefined && typeof dto.operationId !== 'string') {
      throw new BadRequestException('操作号格式无效');
    }
    const operationId = dto.operationId?.trim() || null;
    if (operationId && operationId.length > 80) {
      throw new BadRequestException('操作号不能超过 80 个字符');
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
    const teaFeeRule = await this.getTeaFeeRule(roomId);
    if (operationId) {
      const existingOperation = await this.db
        .select({ roomId: mahjongTransactions.roomId, payerId: mahjongTransactions.payerId })
        .from(mahjongTransactions)
        .where(eq(mahjongTransactions.operationId, operationId));
      if (existingOperation.length > 0) {
        if (existingOperation[0].roomId !== roomId || existingOperation[0].payerId !== dto.payerId) {
          throw new ConflictException('操作号已被使用');
        }
        return this.getRoomDetail(roomCode);
      }
    }

    const payerSeat =
      (await this.db
        .select({ id: mahjongSeats.id })
        .from(mahjongSeats)
        .where(
          and(eq(mahjongSeats.roomId, roomId), eq(mahjongSeats.userId, dto.payerId)),
        )).length > 0;

    if (roomMode === 'seated') {
      // 坐下模式：付款方必须在座位上
      await this.assertActiveMember(roomId, dto.payerId);
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
              isNull(mahjongRoomMembers.leftAt),
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
        await this.assertActiveMember(roomId, dto.payeeId);
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
                isNull(mahjongRoomMembers.leftAt),
              ),
            )).length > 0;
        if (!payeeMember) {
          throw new BadRequestException('收款方不是本房间成员');
        }
      }
      payeeIdValue = dto.payeeId;
    }

    try {
      await this.db.insert(mahjongTransactions).values({
        id: randomUUID(),
        roomId,
        operationId,
        transactionType: 'manual',
        autoFeeRuleVersion:
          dto.payeeType === 'user' && teaFeeRule.enabled ? teaFeeRule.version : null,
        autoFeeMode:
          dto.payeeType === 'user' && teaFeeRule.enabled ? teaFeeRule.mode : null,
        autoFeeThresholdAmount:
          dto.payeeType === 'user' && teaFeeRule.enabled ? teaFeeRule.thresholdAmount : null,
        autoFeeRatePercent:
          dto.payeeType === 'user' && teaFeeRule.enabled && teaFeeRule.mode === 'percentage'
            ? teaFeeRule.ratePercent
            : null,
        autoFeeAmount:
          dto.payeeType === 'user' && teaFeeRule.enabled && teaFeeRule.mode === 'threshold'
            ? teaFeeRule.feeAmount
            : null,
        payerId: dto.payerId,
        payeeType: dto.payeeType,
        payeeId: payeeIdValue,
        amount: fromCents(toCents(amount)),
        remark: dto.remark,
      });
    } catch (error) {
      if (operationId && isUniqueConstraintError(error)) {
        const existingOperation = await this.db
          .select({ roomId: mahjongTransactions.roomId, payerId: mahjongTransactions.payerId })
          .from(mahjongTransactions)
          .where(eq(mahjongTransactions.operationId, operationId));
        if (existingOperation[0]?.roomId === roomId && existingOperation[0]?.payerId === dto.payerId) {
          return this.getRoomDetail(roomCode);
        }
        throw new ConflictException('操作号已被使用');
      }
      throw error;
    }

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
