import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';

dotenv.config();

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  // 健康检查（供 Railway 等 PaaS 探活）
  app.use('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // CORS：默认仅同源；跨域部署时通过 CORS_ORIGIN 显式指定允许的来源（逗号分隔）
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : false,
    credentials: true,
  });

  // 注意：各业务 controller 已自带 'api/xxx' 前缀，这里不能再设置全局前缀，避免出现 /api/api/xxx 双重前缀

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '0.0.0.0';
  // Railway / Vercel 等 PaaS 通常注入 PORT，此处兼容
  const port = Number(process.env.SERVER_PORT || process.env.PORT || '3000');

  // 注册视图引擎，渲染 client 目录下的 html 文件
  app.setBaseViewsDir(join(process.cwd(), 'dist/client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  // 静态资源
  app.useStaticAssets(join(process.cwd(), 'dist/client'), {
    prefix: '/',
  });

  await app.listen(port, host);
  logger.log(`Server running on http://${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
