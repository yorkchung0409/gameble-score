import { Controller, Get, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { MahjongService } from '@server/modules/mahjong/mahjong.service';
import { ProfileService } from './profile.service';

@Controller('api/mini/me')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly mahjongService: MahjongService,
  ) {}

  @Get('summary')
  async getSummary(@Headers('x-wx-openid') cloudOpenId?: string) {
    return this.profileService.getSummary(await this.resolveUserId(cloudOpenId));
  }

  @Get('poker-ledgers')
  async getPokerLedgers(@Headers('x-wx-openid') cloudOpenId?: string) {
    return { ledgers: await this.profileService.getPokerLedgers(await this.resolveUserId(cloudOpenId)) };
  }

  @Get('mahjong-rooms')
  async getMahjongRooms(@Headers('x-wx-openid') cloudOpenId?: string) {
    return { rooms: await this.profileService.getMahjongRooms(await this.resolveUserId(cloudOpenId)) };
  }

  @Get('mahjong-opponents')
  async getMahjongOpponents(@Headers('x-wx-openid') cloudOpenId?: string) {
    return { opponents: await this.profileService.getMahjongOpponents(await this.resolveUserId(cloudOpenId)) };
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
