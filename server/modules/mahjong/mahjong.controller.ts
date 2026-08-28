import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
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
  CreateTransactionRequest,
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
    return this.mahjongService.createRoom(dto.roomCode, dto.name);
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

  // ---------- 转账记录相关 ----------

  @Post('rooms/:roomCode/transactions')
  async createTransaction(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateTransactionRequest,
  ): Promise<MahjongRoomDetailResponse> {
    return this.mahjongService.createTransaction(roomCode, dto);
  }

  @Delete('rooms/:roomCode/transactions/:transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTransaction(
    @Param('roomCode') roomCode: string,
    @Param('transactionId') transactionId: string,
  ): Promise<void> {
    await this.mahjongService.deleteTransaction(roomCode, transactionId);
  }
}
