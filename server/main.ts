import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import * as dotenv from 'dotenv';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'mysql2';

dotenv.config();

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { MahjongRealtimeService } from './modules/mahjong/mahjong-realtime.service';
import { MYSQL_POOL } from './database/drizzle.module';

const bootStartedAt = Date.now();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  const logger = new Logger('Bootstrap');

  // Keep startup timing separate from application error logs so cold-start
  // behavior can be measured from the cloud hosting logs.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestStartedAt = Date.now();
    res.on('finish', () => {
      const startupAgeMs = requestStartedAt - bootStartedAt;
      logger.log(
        JSON.stringify({
          type: 'req_timing',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - requestStartedAt,
          startupAgeMs,
          startupWindow: startupAgeMs < 30_000,
        }),
      );
    });
    next();
  });

  const expressApp = app.getHttpAdapter().getInstance();
  const mysqlPool = app.get<Pool>(MYSQL_POOL);

  // 存活检查不访问数据库，供云托管快速判断 Node 进程是否已经启动。
  expressApp.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 小程序冷启动预热使用就绪检查；只有数据库也可用时才返回成功。
  expressApp.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      await mysqlPool.promise().query('SELECT 1');
      res.json({ status: 'ready', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'starting' });
    }
  });

  // CORS：默认仅同源；跨域部署时通过 CORS_ORIGIN 显式指定允许的来源（逗号分隔）
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : false,
    credentials: true,
  });

  // 注意：各业务 controller 已自带 'api/xxx' 前缀，这里不能再设置全局前缀，避免出现 /api/api/xxx 双重前缀

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
  app.get(MahjongRealtimeService).attach(app.getHttpServer());
  logger.log(`Server running on http://${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
