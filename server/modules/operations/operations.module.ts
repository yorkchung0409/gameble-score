import { Module } from '@nestjs/common';
import { MahjongModule } from '@server/modules/mahjong/mahjong.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [MahjongModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
