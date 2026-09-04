import { Module } from '@nestjs/common';
import { MahjongModule } from '@server/modules/mahjong/mahjong.module';
import { PokerController } from './poker.controller';
import { MiniPokerController } from './mini-poker.controller';
import { PokerService } from './poker.service';

@Module({
  imports: [MahjongModule],
  controllers: [PokerController, MiniPokerController],
  providers: [PokerService],
  exports: [PokerService],
})
export class PokerModule {}
