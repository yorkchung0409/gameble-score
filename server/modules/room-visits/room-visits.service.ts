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
    if (!dto.deviceId || dto.deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId 不能为空');
    }
    if (!dto.roomId || dto.roomId.trim().length === 0) {
      throw new BadRequestException('roomId 不能为空');
    }
    if (!dto.gameType || dto.gameType.trim().length === 0) {
      throw new BadRequestException('gameType 不能为空');
    }

    const existingRows = await this.db
      .select()
      .from(userRoomVisits)
      .where(
        and(
          eq(userRoomVisits.deviceId, dto.deviceId),
          eq(userRoomVisits.roomId, dto.roomId),
          eq(userRoomVisits.gameType, dto.gameType),
        ),
      );

    if (existingRows.length > 0) {
      await this.db
        .update(userRoomVisits)
        .set({
          lastVisitedAt: new Date(),
          roomCode: dto.roomCode,
          roomName: dto.roomName,
          userId: dto.userId ?? null,
        })
        .where(eq(userRoomVisits.id, existingRows[0].id));
      const [updated] = await this.db
        .select()
        .from(userRoomVisits)
        .where(eq(userRoomVisits.id, existingRows[0].id));
      return { visit: toRoomVisitRecord(updated) };
    }

    const id = randomUUID();
    await this.db
      .insert(userRoomVisits)
      .values({
        id,
        deviceId: dto.deviceId,
        userId: dto.userId ?? null,
        roomId: dto.roomId,
        gameType: dto.gameType,
        roomCode: dto.roomCode,
        roomName: dto.roomName,
      });
    const [inserted] = await this.db
      .select()
      .from(userRoomVisits)
      .where(eq(userRoomVisits.id, id));
    return { visit: toRoomVisitRecord(inserted) };
  }

  async removeVisit(dto: {
    deviceId: string;
    gameType: string;
    roomCode: string;
  }): Promise<{ removed: boolean }> {
    if (!dto.deviceId || dto.deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId 不能为空');
    }
    if (!dto.gameType || dto.gameType.trim().length === 0) {
      throw new BadRequestException('gameType 不能为空');
    }
    if (!dto.roomCode || dto.roomCode.trim().length === 0) {
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
