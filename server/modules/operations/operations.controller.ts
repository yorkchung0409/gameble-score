import { Controller, Get, Headers } from '@nestjs/common';
import type { MiniOperationsOverviewResponse } from '@shared/api.interface';
import { OperationsService } from './operations.service';

@Controller('api/mini/operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('overview')
  async getOverview(
    @Headers('x-wx-openid') cloudOpenId?: string,
  ): Promise<MiniOperationsOverviewResponse> {
    return this.operationsService.getOverview(cloudOpenId);
  }
}
