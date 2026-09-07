import { Module } from '@nestjs/common';
import { MahjongModule } from '@server/modules/mahjong/mahjong.module';
import { OperationsModule } from '@server/modules/operations/operations.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { DataRetentionService } from './data-retention.service';

@Module({
  imports: [MahjongModule, OperationsModule],
  controllers: [ProfileController],
  providers: [ProfileService, DataRetentionService],
})
export class ProfileModule {}
