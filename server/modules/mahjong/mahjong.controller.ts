import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { MahjongService } from './mahjong.service';
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
  CreateTransactionRequest,
  ReverseTransactionRequest,
  WeChatMiniProgramLoginRequest,
  WeChatMiniProgramLoginResponse,
  UpdateMahjongUserProfileRequest,
} from '@shared/api.interface';

@Controller('api/mahjong')
export class MahjongController {
  constructor(private readonly mahjongService: MahjongService) {}

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
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.getRoomDetail(roomCode);
  }

  // ---------- 座位相关 ----------

  @Post('rooms/:roomCode/seats/sit')
  async sitDown(
    @Param('roomCode') roomCode: string,
    @Body() dto: SitDownRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return this.mahjongService.sitDown(roomCode, userId ?? dto.userId, dto.seatIndex);
  }

  @Post('rooms/:roomCode/seats/leave')
  async leaveSeat(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveSeatRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return this.mahjongService.leaveSeat(roomCode, userId ?? dto.userId);
  }

  // ---------- 成员 / 模式相关 ----------

  @Post('rooms/:roomCode/join')
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: JoinRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return this.mahjongService.joinRoom(roomCode, userId ?? dto.userId);
  }

  @Post('rooms/:roomCode/leave')
  async leaveRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const userId = await this.resolveCloudUserId(cloudOpenId, dto.userId);
    return this.mahjongService.leaveRoom(roomCode, userId ?? dto.userId);
  }

  @Post('rooms/:roomCode/mode')
  async updateRoomMode(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateRoomModeRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return this.mahjongService.updateMode(
      roomCode,
      dto.mode,
      operatorUserId ?? dto.operatorUserId,
    );
  }

  // ---------- 转账记录相关 ----------

  @Post('rooms/:roomCode/transactions')
  async createTransaction(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateTransactionRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const payerId = await this.resolveCloudUserId(cloudOpenId, dto.payerId);
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return this.mahjongService.createTransaction(roomCode, {
      ...dto,
      payerId: payerId ?? dto.payerId,
      operatorUserId: operatorUserId ?? dto.operatorUserId,
    });
  }

  @Post('rooms/:roomCode/transactions/:transactionId/reverse')
  async reverseTransaction(
    @Param('roomCode') roomCode: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: ReverseTransactionRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MahjongRoomDetailResponse> {
    const operatorUserId = await this.resolveCloudUserId(
      cloudOpenId,
      dto.operatorUserId,
    );
    return this.mahjongService.reverseTransaction(
      roomCode,
      transactionId,
      operatorUserId ?? dto.operatorUserId,
    );
  }
}
