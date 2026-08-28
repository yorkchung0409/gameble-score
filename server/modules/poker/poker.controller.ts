import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PokerService } from './poker.service';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  UpdateRoomRequest,
  CreatePlayerRequest,
  Player,
  CreateGameRequest,
  UpdateGameRequest,
  CreateGameResponse,
  RoomDetailResponse,
} from '@shared/api.interface';

@Controller('api/poker')
export class PokerController {
  constructor(private readonly pokerService: PokerService) {}

  @Post('rooms')
  async createRoom(@Body() dto: CreateRoomRequest): Promise<CreateRoomResponse> {
    return this.pokerService.createRoom(
      dto.roomCode,
      dto.roomName,
      dto.gameType ?? 'texas',
    );
  }

  @Get('rooms/:roomCode')
  async getRoomDetail(
    @Param('roomCode') roomCode: string,
  ): Promise<RoomDetailResponse> {
    return this.pokerService.getRoomDetail(roomCode);
  }

  @Patch('rooms/:roomCode')
  async updateRoom(
    @Param('roomCode') roomCode: string,
    @Body() dto: UpdateRoomRequest,
  ): Promise<{ room: import('@shared/api.interface').Room }> {
    if (dto.roomName === undefined) {
      return this.pokerService.getRoomDetail(roomCode).then((d) => ({ room: d.room }));
    }
    return this.pokerService.updateRoom(roomCode, dto.roomName);
  }

  @Post('rooms/:roomCode/players')
  async addPlayer(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreatePlayerRequest,
  ): Promise<Player> {
    return this.pokerService.addPlayer(roomCode, dto.name);
  }

  @Delete('rooms/:roomCode/players/:playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlayer(
    @Param('roomCode') roomCode: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    await this.pokerService.deletePlayer(roomCode, playerId);
  }

  @Post('rooms/:roomCode/games')
  async createGame(
    @Param('roomCode') roomCode: string,
    @Body() dto: CreateGameRequest,
  ): Promise<CreateGameResponse> {
    return this.pokerService.createGame(roomCode, dto);
  }

  @Put('rooms/:roomCode/games/:gameId')
  async updateGame(
    @Param('roomCode') roomCode: string,
    @Param('gameId') gameId: string,
    @Body() dto: UpdateGameRequest,
  ): Promise<CreateGameResponse> {
    return this.pokerService.updateGame(roomCode, gameId, dto);
  }

  @Delete('rooms/:roomCode/games/:gameId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGame(
    @Param('roomCode') roomCode: string,
    @Param('gameId') gameId: string,
  ): Promise<void> {
    await this.pokerService.deleteGame(roomCode, gameId);
  }
}
