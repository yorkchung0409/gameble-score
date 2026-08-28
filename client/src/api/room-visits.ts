import { apiClient } from './client';
import type {
  RecordRoomVisitRequest,
  GetRoomVisitsResponse,
  RoomVisitRecord,
} from '@shared/api.interface';

const BASE = '/api/room-visits';

export async function recordVisit(
  data: RecordRoomVisitRequest,
): Promise<{ visit: RoomVisitRecord }> {
  const res = await apiClient.post<{ visit: RoomVisitRecord }>(BASE, data);
  return res.data;
}

export async function getVisits(
  deviceId: string,
  gameType: string,
  limit: number = 10,
): Promise<GetRoomVisitsResponse> {
  const res = await apiClient.get<GetRoomVisitsResponse>(BASE, {
    params: { deviceId, gameType, limit },
  });
  return res.data;
}
