import { Controller, Get, Headers, Param, Query, UnauthorizedException } from '@nestjs/common';
import { MahjongService } from '@server/modules/mahjong/mahjong.service';
import type {
  MiniProfileDashboardResponse,
  MiniRecentActivityResponse,
} from '@shared/api.interface';
import { ProfileService } from './profile.service';
import { OperationsService } from '@server/modules/operations/operations.service';

@Controller('api/mini/me')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly mahjongService: MahjongService,
    private readonly operationsService: OperationsService,
  ) {}

  @Get('dashboard')
  async getDashboard(
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('historyLimit') historyLimitValue?: string,
  ): Promise<MiniProfileDashboardResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    const parsedLimit = Number(historyLimitValue);
    const historyLimit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 20)
      : 1;
    const [summary, poker, mahjong] = await Promise.all([
      this.profileService.getSummary(userId),
      this.profileService.getPokerLedgers(userId, historyLimit, 0),
      this.profileService.getMahjongRooms(userId, historyLimit, 0),
    ]);
    return {
      summary,
      poker,
      mahjong,
      canAccessOperations: this.operationsService.isAdminOpenId(cloudOpenId),
    };
  }

  @Get('recent')
  async getRecentActivity(
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MiniRecentActivityResponse> {
    const userId = await this.resolveUserId(cloudOpenId);
    const [poker, mahjong] = await Promise.all([
      this.profileService.getPokerLedgers(userId, 1, 0),
      // “最近房间” is a re-entry shortcut, not an active-membership list.
      // Leaving a room must not make its most recent record disappear.
      this.profileService.getMahjongRooms(userId, 1, 0),
    ]);
    return { poker, mahjong };
  }

  @Get('summary')
  async getSummary(@Headers('x-wx-openid') cloudOpenId?: string) {
    return this.profileService.getSummary(await this.resolveUserId(cloudOpenId));
  }

  @Get('poker-ledgers')
  async getPokerLedgers(
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.profileService.getPokerLedgers(
      await this.resolveUserId(cloudOpenId),
      Number(limit),
      Number(offset),
    );
  }

  @Get('mahjong-rooms')
  async getMahjongRooms(
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.profileService.getMahjongRooms(
      await this.resolveUserId(cloudOpenId),
      Number(limit),
      Number(offset),
      activeOnly === 'true',
    );
  }

  @Get('mahjong-opponents')
  async getMahjongOpponents(
    @Headers('x-wx-openid') cloudOpenId?: string,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const opponents = await this.profileService.getMahjongOpponents(
      await this.resolveUserId(cloudOpenId),
    );
    if (limitValue === undefined) return { opponents };
    const parsedLimit = Number(limitValue);
    const parsedOffset = Number(offsetValue);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;
    const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const page = opponents.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      opponents: page,
      total: opponents.length,
      hasMore: nextOffset < opponents.length,
      nextOffset,
    };
  }

  @Get('mahjong-opponents/:opponentId')
  async getMahjongOpponentHistory(
    @Param('opponentId') opponentId: string,
    @Headers('x-wx-openid') cloudOpenId?: string,
  ) {
    return this.profileService.getMahjongOpponentHistory(
      await this.resolveUserId(cloudOpenId),
      opponentId,
    );
  }

  private async resolveUserId(cloudOpenId?: string): Promise<string> {
    const normalizedOpenId = cloudOpenId?.trim();
    if (!normalizedOpenId) {
      throw new UnauthorizedException('请通过微信小程序访问');
    }
    return this.mahjongService.getUserIdByWeChatOpenId(normalizedOpenId);
  }
}
