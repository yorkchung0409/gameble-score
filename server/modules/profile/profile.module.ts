import { Module } from '@nestjs/common';
import { MahjongModule } from '@server/modules/mahjong/mahjong.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [MahjongModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
