import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { MahjongService } from '@server/modules/mahjong/mahjong.service';
import { PokerService } from './poker.service';
import type {
  CreateGameRequest,
  CreateGameResponse,
  CreatePlayerRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  MiniPokerLedgerDetailResponse,
  Player,
  UpdateGameRequest,
  UpdateRoomRequest,
} from '@shared/api.interface';

@Controller('api/mini/poker')
export class MiniPokerController {
  constructor(
    private readonly pokerService: PokerService,
    private readonly mahjongService: MahjongService,
  ) {}

  @Post('ledgers')
  async createLedger(
    @Body() dto: CreateRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<CreateRoomResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.createPrivateRoom(userId, dto.roomCode, dto.roomName);
  }

  @Get('ledgers/:roomCode')
  async getLedger(
    @Param('roomCode') roomCode: string,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MiniPokerLedgerDetailResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.getPrivateRoomDetail(userId, roomCode);
  }

  @Patch('ledgers/:roomCode')
  async updateLedger(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateRoomRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<{ room: import('@shared/api.interface').Room }> {
    const userId = await this.resolveUserId(cloudOpenId);
    if (dto.roomName === undefined) {
      return this.pokerService.getPrivateRoomDetail(userId, roomCode).then((detail) => ({ room: detail.room }));
    }
    return this.pokerService.updatePrivateRoom(userId, roomCode, dto.roomName);
  }

  @Patch('ledgers/:roomCode/self-player')
  async updateSelfPlayer(
    @Param('roomCode') roomCode: string,
    @Body() dto: { playerId?: string | null },
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<{ selfPlayerId: string | null }> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.updatePrivateSelfPlayer(userId, roomCode, dto.playerId ?? null);
  }

  @Post('ledgers/:roomCode/players')
  async addPlayer(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreatePlayerRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<Player> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.addPrivatePlayer(userId, roomCode, dto.name);
  }

  @Delete('ledgers/:roomCode/players/:playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlayer(
    @Param('roomCode') roomCode: string,
    @Param('playerId') playerId: string,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<void> {
    const userId = await this.resolveUserId(cloudOpenId);
    await this.pokerService.deletePrivatePlayer(userId, roomCode, playerId);
  }

  @Post('ledgers/:roomCode/games')
  async createGame(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateGameRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<CreateGameResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.createPrivateGame(userId, roomCode, dto);
  }

  @Put('ledgers/:roomCode/games/:gameId')
  async updateGame(
    @Param('roomCode') roomCode: string,
    @Param('gameId') gameId: string,
    @Body() dto: UpdateGameRequest,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<CreateGameResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    return this.pokerService.updatePrivateGame(userId, roomCode, gameId, dto);
  }

  @Delete('ledgers/:roomCode/games/:gameId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGame(
    @Param('roomCode') roomCode: string,
    @Param('gameId') gameId: string,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<void> {
    const userId = await this.resolveUserId(cloudOpenId);
    await this.pokerService.deletePrivateGame(userId, roomCode, gameId);
  }

  private async resolveUserId(cloudOpenId?: string): Promise<string> {
    const normalizedOpenId = cloudOpenId?.trim();
    if (!normalizedOpenId) {
      throw new UnauthorizedException('请通过微信小程序访问');
    }
    return this.mahjongService.getUserIdByWeChatOpenId(normalizedOpenId);
  }
}
