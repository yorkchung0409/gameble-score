import { Module } from '@nestjs/common';
import { MahjongController } from './mahjong.controller';
import { MahjongService } from './mahjong.service';
import { MahjongRealtimeService } from './mahjong-realtime.service';

@Module({
  controllers: [MahjongController],
  providers: [MahjongService, MahjongRealtimeService],
  exports: [MahjongService, MahjongRealtimeService],
})
export class MahjongModule {}
