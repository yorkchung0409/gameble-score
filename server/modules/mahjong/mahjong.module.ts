import { Module } from '@nestjs/common';
import { MahjongController } from './mahjong.controller';
import { MahjongService } from './mahjong.service';

@Module({
  controllers: [MahjongController],
  providers: [MahjongService],
})
export class MahjongModule {}
