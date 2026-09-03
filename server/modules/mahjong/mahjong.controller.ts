import {
  Controller,
  Post,
  Get,
  Body,
  Param,
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
} from '@shared/api.interface';

@Controller('api/mahjong')
export class MahjongController {
  constructor(private readonly mahjongService: MahjongService) {}

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

  // ---------- 房间相关 ----------

  @Post('rooms')
  async createRoom(
    @Body() dto: CreateMahjongRoomRequest,
  ): Promise<CreateMahjongRoomResponse> {
    return this.mahjongService.createRoom(
      dto.roomCode,
      dto.name,
      dto.creatorUserId,
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
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.sitDown(roomCode, dto.userId, dto.seatIndex);
  }

  @Post('rooms/:roomCode/seats/leave')
  async leaveSeat(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveSeatRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.leaveSeat(roomCode, dto.userId);
  }

  // ---------- 成员 / 模式相关 ----------

  @Post('rooms/:roomCode/join')
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: JoinRoomRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.joinRoom(roomCode, dto.userId);
  }

  @Post('rooms/:roomCode/leave')
  async leaveRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: LeaveRoomRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.leaveRoom(roomCode, dto.userId);
  }

  @Post('rooms/:roomCode/mode')
  async updateRoomMode(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateRoomModeRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.updateMode(
      roomCode,
      dto.mode,
      dto.operatorUserId,
    );
  }

  // ---------- 转账记录相关 ----------

  @Post('rooms/:roomCode/transactions')
  async createTransaction(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateTransactionRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.createTransaction(roomCode, dto);
  }

  @Post('rooms/:roomCode/transactions/:transactionId/reverse')
  async reverseTransaction(
    @Param('roomCode') roomCode: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: ReverseTransactionRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.reverseTransaction(
      roomCode,
      transactionId,
      dto.operatorUserId,
    );
  }
}
