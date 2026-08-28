import { apiClient } from './client';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  RoomDetailResponse,
  UpdateRoomRequest,
  CreatePlayerRequest,
  Player,
  CreateGameRequest,
  UpdateGameRequest,
  CreateGameResponse,
} from '@shared/api.interface';

const BASE = '/api/poker/rooms';

export async function createRoom(
  data: CreateRoomRequest,
): Promise<CreateRoomResponse> {
  const res = await apiClient.post<CreateRoomResponse>(BASE, {
    roomName: data.roomName,
    roomCode: data.roomCode,
    gameType: data.gameType ?? 'texas',
  });
  return res.data;
}

export async function getRoom(roomCode: string): Promise<RoomDetailResponse> {
  const res = await apiClient.get<RoomDetailResponse>(
    `${BASE}/${roomCode}`,
  );
  return res.data;
}

export async function updateRoom(
  roomCode: string,
  data: UpdateRoomRequest,
): Promise<void> {
  await apiClient.patch(`${BASE}/${roomCode}`, data);
}

export async function addPlayer(
  roomCode: string,
  data: CreatePlayerRequest,
): Promise<Player> {
  const res = await apiClient.post<Player>(
    `${BASE}/${roomCode}/players`,
    data,
  );
  return res.data;
}

export async function removePlayer(
  roomCode: string,
  playerId: string,
): Promise<void> {
  await apiClient.delete(`${BASE}/${roomCode}/players/${playerId}`);
}

export async function createGame(
  roomCode: string,
  data: CreateGameRequest,
): Promise<CreateGameResponse> {
  const res = await apiClient.post<CreateGameResponse>(
    `${BASE}/${roomCode}/games`,
    data,
  );
  return res.data;
}

export async function updateGame(
  roomCode: string,
  gameId: string,
  data: UpdateGameRequest,
): Promise<CreateGameResponse> {
  const res = await apiClient.put<CreateGameResponse>(
    `${BASE}/${roomCode}/games/${gameId}`,
    data,
  );
  return res.data;
}

export async function deleteGame(
  roomCode: string,
  gameId: string,
): Promise<void> {
  await apiClient.delete(`${BASE}/${roomCode}/games/${gameId}`);
}
