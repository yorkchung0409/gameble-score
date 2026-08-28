import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/drizzle.module';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { PokerModule } from './modules/poker/poker.module';
import { MahjongModule } from './modules/mahjong/mahjong.module';
import { RoomVisitsModule } from './modules/room-visits/room-visits.module';
import { ViewModule } from './modules/view/view.module';

@Module({
  imports: [
    DatabaseModule,
    PokerModule,
    MahjongModule,
    RoomVisitsModule,
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
