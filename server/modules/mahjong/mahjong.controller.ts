import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Headers,
  ForbiddenException,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { MahjongService } from './mahjong.service';
import { MahjongRealtimeService } from './mahjong-realtime.service';
import type {
  CreateUserRequest,
  CreateUserResponse,
  GetUserByDeviceResponse,
  CreateMahjongRoomRequest,
  CreateMahjongRoomResponse,
  MahjongRoomDetailResponse,
  SitDownRequest,
  LeaveSeatRequest,
  JoinRoomRequest,
  LeaveRoomRequest,
  UpdateRoomModeRequest,
  UpdateMahjongTeaFeeRuleRequest,
  CreateTransactionRequest,
  ReverseTransactionRequest,
  WeChatMiniProgramLoginRequest,
  WeChatMiniProgramLoginResponse,
  UpdateMahjongUserProfileRequest,
} from '@shared/api.interface';

function paginateTransactions(
  detail: MahjongRoomDetailResponse,
  limitValue?: string,
  offsetValue?: string,
): MahjongRoomDetailResponse {
  if (limitValue === undefined) return detail;
  const parsedLimit = Number(limitValue);
  const parsedOffset = Number(offsetValue);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 30;
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const total = detail.transactions.length;
  const transactions = detail.transactions.slice(offset, offset + limit);
  const nextOffset = offset + transactions.length;
  return {
    ...detail,
    transactions,
    transactionPage: { total, hasMore: nextOffset < total, nextOffset },
  };
}

function parseTransactionPage(
  limitValue?: string,
  offsetValue?: string,
): { limit: number; offset: number } | undefined {
  if (limitValue === undefined) return undefined;
  const parsedLimit = Number(limitValue);
  const parsedOffset = Number(offsetValue);
  return {
    limit: Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 30,
    offset: Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

@Controller('api/mahjong')
export class MahjongController {
  constructor(
    private readonly mahjongService: MahjongService,
    private readonly realtime: MahjongRealtimeService,
  ) {}

  /**
   * CloudBase injects x-wx-openid only for calls on the Mini Program private
   * channel. Bind the claimed user ID to it so a client cannot act as another
   * room member by changing a JSON field.
   */
  private async resolveCloudUserId(
    cloudOpenId: string | undefined,
    claimedUserId?: string,
  ): Promise<string | undefined> {
    const normalizedOpenId = cloudOpenId?.trim();
    if (!normalizedOpenId) return claimedUserId;

    const authenticatedUserId =
      await this.mahjongService.getUserIdByWeChatOpenId(normalizedOpenId);
    if (claimedUserId && claimedUserId !== authenticatedUserId) {
      throw new ForbiddenException('不能以其他用户身份操作');
    }
    return authenticatedUserId;
  }

  // ---------- 用户相关 ----------

  @Post('users')
  async createUser(@Body() dto: CreateUserRequest): Promise<CreateUserResponse> {
    return this.mahjongService.createUser(dto.name, dto.deviceId);
  }

  @Get('users/by-device/:deviceId')
  async getUserByDevice(
    @Param('deviceId') deviceId: string,
  ): Promise<GetUserByDeviceResponse> {
    return this.mahjongService.getUserByDevice(deviceId);
  }

  @Post('auth/wechat')
  async loginWithWeChatCode(
    @Body() dto: WeChatMiniProgramLoginRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<WeChatMiniProgramLoginResponse> {
    const normalizedOpenId = cloudOpenId?.trim();
    if (normalizedOpenId) {
      return this.mahjongService.loginWithWeChatOpenId(normalizedOpenId);
    }
    return this.mahjongService.loginWithWeChatCode(dto?.code);
  }

  @Patch('users/:userId/profile')
  async updateUserProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateMahjongUserProfileRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<CreateUserResponse> {
    const effectiveUserId = await this.resolveCloudUserId(cloudOpenId, userId);
    return this.mahjongService.updateUserName(effectiveUserId ?? userId, dto.name);
  }

  // ---------- 房间相关 ----------

  @Post('rooms')
  async createRoom(
    @Body() dto: CreateMahjongRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<CreateMahjongRoomResponse> {
    const creatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.creatorUserId,
    );
    return this.mahjongService.createRoom(
      dto.roomCode,
      dto.name,
      creatorUserId,
    );
  }

  @Get('rooms/:roomCode')
  async getRoomDetail(
    @Param('roomCode') roomCode: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.getRoomDetail(
      roomCode,
      parseTransactionPage(transactionLimit, transactionOffset),
    );
  }

  /**
   * Long-poll fallback for clients that cannot keep a WebSocket connection.
   * The endpoint waits at most 45 seconds, then the client immediately opens
   * the next request with the returned version.
   */
  @Get('rooms/:roomCode/events')
  async waitForRoomEvent(
    @Param('roomCode') roomCode: string,
    @Query('since') since = '0',
  ): Promise<{ version: number }> {
    const version = Number(since);
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new BadRequestException('since 必须是非负整数');
    }
    return this.realtime.waitForUpdate(roomCode, version);
  }

  // ---------- 座位相关 ----------

  @Post('rooms/:roomCode/seats/sit')
  async sitDown(
    @Param('roomCode') roomCode: string,
    @Body() dto: SitDownRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return paginateTransactions(
      await this.mahjongService.sitDown(roomCode, userId ?? dto.userId, dto.seatIndex),
      transactionLimit,
      transactionOffset,
    );
  }

  @Post('rooms/:roomCode/seats/leave')
  async leaveSeat(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveSeatRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return paginateTransactions(
      await this.mahjongService.leaveSeat(roomCode, userId ?? dto.userId),
      transactionLimit,
      transactionOffset,
    );
  }

  // ---------- 成员 / 模式相关 ----------

  @Post('rooms/:roomCode/join')
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: JoinRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return paginateTransactions(
      await this.mahjongService.joinRoom(roomCode, userId ?? dto.userId),
      transactionLimit,
      transactionOffset,
    );
  }

  @Post('rooms/:roomCode/leave')
  async leaveRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return paginateTransactions(
      await this.mahjongService.leaveRoom(roomCode, userId ?? dto.userId),
      transactionLimit,
      transactionOffset,
    );
  }

  @Post('rooms/:roomCode/mode')
  async updateRoomMode(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateRoomModeRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return paginateTransactions(
      await this.mahjongService.updateMode(
        roomCode,
        dto.mode,
        operatorUserId ?? dto.operatorUserId,
      ),
      transactionLimit,
      transactionOffset,
    );
  }

  @Patch('rooms/:roomCode/tea-fee-rule')
  async updateTeaFeeRule(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateMahjongTeaFeeRuleRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto?.operatorUserId,
    );
    return paginateTransactions(
      await this.mahjongService.updateTeaFeeRule(roomCode, {
        ...dto,
        operatorUserId: operatorUserId ?? dto.operatorUserId,
      }),
      transactionLimit,
      transactionOffset,
    );
  }

  // ---------- 转账记录相关 ----------

  @Post('rooms/:roomCode/transactions')
  async createTransaction(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateTransactionRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const payerId = await this.resolveCloudUserId(cloudOpenId, dto.payerId);
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return paginateTransactions(
      await this.mahjongService.createTransaction(roomCode, {
        ...dto,
        payerId: payerId ?? dto.payerId,
        operatorUserId: operatorUserId ?? dto.operatorUserId,
      }),
      transactionLimit,
      transactionOffset,
    );
  }

  @Post('rooms/:roomCode/transactions/:transactionId/reverse')
  async reverseTransaction(
    @Param('roomCode') roomCode: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: ReverseTransactionRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('transactionLimit') transactionLimit?: string,
    @Query('transactionOffset') transactionOffset?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return paginateTransactions(
      await this.mahjongService.reverseTransaction(
        roomCode,
        transactionId,
        operatorUserId ?? dto.operatorUserId,
      ),
      transactionLimit,
      transactionOffset,
    );
  }
}
