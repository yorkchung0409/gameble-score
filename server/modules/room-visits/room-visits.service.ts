import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DRIZZLE_DB, type DbType } from '@server/database/drizzle.module';
import { userRoomVisits } from '@server/database/schema';
import { eq, desc, and } from 'drizzle-orm';
import type {
  RoomVisitRecord,
  GetRoomVisitsResponse,
  RecordRoomVisitRequest,
} from '@shared/api.interface';

function toRoomVisitRecord(row: typeof userRoomVisits.$inferSelect): RoomVisitRecord {
  return {
    id: row.id,
    roomId: row.roomId,
    roomCode: row.roomCode,
    roomName: row.roomName,
    gameType: row.gameType,
    lastVisitedAt: row.lastVisitedAt.toISOString(),
  };
}

@Injectable()
export class RoomVisitsService {
  private readonly logger = new Logger(RoomVisitsService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbType) {}

  async recordVisit(dto: RecordRoomVisitRequest): Promise<{ visit: RoomVisitRecord }> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('访问记录无效');
    }
    if (typeof dto.deviceId !== 'string' || dto.deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId 不能为空');
    }
    if (typeof dto.roomId !== 'string' || dto.roomId.trim().length === 0) {
      throw new BadRequestException('roomId 不能为空');
    }
    if (typeof dto.gameType !== 'string' || dto.gameType.trim().length === 0) {
      throw new BadRequestException('gameType 不能为空');
    }
    if (typeof dto.roomCode !== 'string' || typeof dto.roomName !== 'string') {
      throw new BadRequestException('房间信息无效');
    }
    const deviceId = dto.deviceId.trim();
    const roomId = dto.roomId.trim();
    const gameType = dto.gameType.trim();
    const roomCode = dto.roomCode.trim();
    const roomName = dto.roomName.trim();
    if (deviceId.length > 100 || roomId.length > 36 || gameType.length > 20 || roomCode.length > 50 || roomName.length > 200) {
      throw new BadRequestException('房间访问记录字段过长');
    }

    const id = randomUUID();
    await this.db
      .insert(userRoomVisits)
      .values({
        id,
        deviceId,
        userId: dto.userId ?? null,
        roomId,
        gameType,
        roomCode,
        roomName,
      })
      .onDuplicateKeyUpdate({
        set: {
          lastVisitedAt: new Date(),
          roomCode,
          roomName,
          userId: dto.userId ?? null,
        },
      });
    const [saved] = await this.db
      .select()
      .from(userRoomVisits)
      .where(
        and(
          eq(userRoomVisits.deviceId, deviceId),
          eq(userRoomVisits.roomId, roomId),
          eq(userRoomVisits.gameType, gameType),
        ),
      );
    return { visit: toRoomVisitRecord(saved) };
  }

  async removeVisit(dto: {
    deviceId: string;
    gameType: string;
    roomCode: string;
  }): Promise<{ removed: boolean }> {
    if (typeof dto.deviceId !== 'string' || dto.deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId 不能为空');
    }
    if (typeof dto.gameType !== 'string' || dto.gameType.trim().length === 0) {
      throw new BadRequestException('gameType 不能为空');
    }
    if (typeof dto.roomCode !== 'string' || dto.roomCode.trim().length === 0) {
      throw new BadRequestException('roomCode 不能为空');
    }
    const rows = await this.db
      .select({ id: userRoomVisits.id })
      .from(userRoomVisits)
      .where(
        and(
          eq(userRoomVisits.deviceId, dto.deviceId),
          eq(userRoomVisits.gameType, dto.gameType),
          eq(userRoomVisits.roomCode, dto.roomCode),
        ),
      );
    if (rows.length > 0) {
      await this.db.delete(userRoomVisits).where(eq(userRoomVisits.id, rows[0].id));
    }
    return { removed: rows.length > 0 };
  }

  async getVisits(
    deviceId: string,
    gameType: string,
    limit: number = 10,
  ): Promise<GetRoomVisitsResponse> {
    if (!deviceId || deviceId.trim().length === 0) {
      return { visits: [] };
    }

    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), 20)
      : 10;
    const rows = await this.db
      .select()
      .from(userRoomVisits)
      .where(
        and(
          eq(userRoomVisits.deviceId, deviceId),
          eq(userRoomVisits.gameType, gameType),
        ),
      )
      .orderBy(desc(userRoomVisits.lastVisitedAt))
      .limit(safeLimit);

    return {
      visits: rows.map((row) => toRoomVisitRecord(row)),
    };
  }
}
