import { Module } from '@nestjs/common';
import { RoomVisitsController } from './room-visits.controller';
import { RoomVisitsService } from './room-visits.service';

@Module({
  controllers: [RoomVisitsController],
  providers: [RoomVisitsService],
})
export class RoomVisitsModule {}
