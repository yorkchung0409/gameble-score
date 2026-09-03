import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
} from '@nestjs/common';
import { RoomVisitsService } from './room-visits.service';
import type {
  RecordRoomVisitRequest,
  RemoveRoomVisitRequest,
  GetRoomVisitsResponse,
  RoomVisitRecord,
} from '@shared/api.interface';

@Controller('api/room-visits')
export class RoomVisitsController {
  constructor(private readonly roomVisitsService: RoomVisitsService) {}

  @Post()
  async recordVisit(
    @Body() dto: RecordRoomVisitRequest,
  ): Promise<{ visit: RoomVisitRecord }> {
    return this.roomVisitsService.recordVisit(dto);
  }

  @Delete()
  async removeVisit(
    @Body() dto: RemoveRoomVisitRequest,
  ): Promise<{ removed: boolean }> {
    return this.roomVisitsService.removeVisit(dto);
  }

  @Get()
  async getVisits(
    @Query('deviceId') deviceId: string,
    @Query('gameType') gameType: string,
    @Query('limit') limit?: string,
  ): Promise<GetRoomVisitsResponse> {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.roomVisitsService.getVisits(deviceId, gameType, limitNum);
  }
}
