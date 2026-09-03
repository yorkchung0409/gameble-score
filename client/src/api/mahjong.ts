import { apiClient } from './client';
import type {
  CreateUserRequest,
  CreateUserResponse,
  GetUserByDeviceResponse,
  CreateMahjongRoomRequest,
  CreateMahjongRoomResponse,
  MahjongRoomDetailResponse,
  SitDownRequest,
  LeaveSeatRequest,
  JoinRoomRequest,
  LeaveRoomRequest,
  UpdateRoomModeRequest,
  CreateTransactionRequest,
  ReverseTransactionRequest,
} from '@shared/api.interface';

const BASE = '/api/mahjong';
const USERS_BASE = `${BASE}/users`;
const ROOMS_BASE = `${BASE}/rooms`;

export async function createUser(
  data: CreateUserRequest,
): Promise<CreateUserResponse> {
  const res = await apiClient.post<CreateUserResponse>(USERS_BASE, data);
  return res.data;
}

export async function getUserByDevice(
  deviceId: string,
): Promise<GetUserByDeviceResponse> {
  const res = await apiClient.get<GetUserByDeviceResponse>(
    `${USERS_BASE}/by-device/${deviceId}`,
  );
  return res.data;
}

export async function createRoom(
  data: CreateMahjongRoomRequest,
): Promise<CreateMahjongRoomResponse> {
  const res = await apiClient.post<CreateMahjongRoomResponse>(
    ROOMS_BASE,
    data,
  );
  return res.data;
}

export async function getRoom(
  roomCode: string,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.get<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}`,
  );
  return res.data;
}

export async function sitDown(
  roomCode: string,
  data: SitDownRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/seats/sit`,
    data,
  );
  return res.data;
}

export async function leaveSeat(
  roomCode: string,
  data: LeaveSeatRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/seats/leave`,
    data,
  );
  return res.data;
}

export async function joinRoom(
  roomCode: string,
  data: JoinRoomRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/join`,
    data,
  );
  return res.data;
}

export async function leaveRoom(
  roomCode: string,
  data: LeaveRoomRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/leave`,
    data,
  );
  return res.data;
}

export async function updateRoomMode(
  roomCode: string,
  data: UpdateRoomModeRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/mode`,
    data,
  );
  return res.data;
}

export async function createTransaction(
  roomCode: string,
  data: CreateTransactionRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/transactions`,
    data,
  );
  return res.data;
}

export async function reverseTransaction(
  roomCode: string,
  transactionId: string,
  data: ReverseTransactionRequest,
): Promise<MahjongRoomDetailResponse> {
  const res = await apiClient.post<MahjongRoomDetailResponse>(
    `${ROOMS_BASE}/${roomCode}/transactions/${transactionId}/reverse`,
    data,
  );
  return res.data;
}
