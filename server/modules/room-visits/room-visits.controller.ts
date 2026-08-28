import {
  Controller,
  Post,
  Get,
  Body,
  Query,
} from '@nestjs/common';
import { RoomVisitsService } from './room-visits.service';
import type {
  RecordRoomVisitRequest,
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
