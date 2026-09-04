export interface Room {
  id: string;
  roomCode: string;
  roomName: string;
  gameType: string;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  roomId: string;
  name: string;
}

export interface GamePlayer {
  id: string;
  gameId: string;
  playerId: string;
  playerName: string;
  buyIn: string;
  balance: string;
  netProfit: string;
}

export interface Game {
  id: string;
  roomId: string;
  gameDate: string;
  players: GamePlayer[];
  totalBuyIn: string;
  playerCount: number;
}

export interface RoomDetailResponse {
  room: Room;
  players: Player[];
  games: Game[];
  stats: {
    totalGames: number;
    totalBuyIn: string;
    latestGameBalanceDiff: string;
    latestGameTurnover: string;
  };
  lastUpdated: string;
}

export interface CreateRoomRequest {
  roomCode?: string;
  roomName: string;
  gameType?: string;
}

export interface CreateRoomResponse {
  room: Room;
}

export interface UpdateRoomRequest {
  roomName?: string;
}

export interface CreatePlayerRequest {
  name: string;
}

export interface CreateGamePlayerRequest {
  playerId: string;
  buyIn: number;
  balance: number;
}

export interface CreateGameRequest {
  gameDate: string;
  players: CreateGamePlayerRequest[];
}

export interface UpdateGameRequest {
  gameDate?: string;
  players?: CreateGamePlayerRequest[];
}

export interface CreateGameResponse {
  game: Game;
}

export interface MahjongUser {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateUserRequest {
  name: string;
  deviceId: string;
}

export interface CreateUserResponse {
  user: MahjongUser;
}

export interface GetUserByDeviceResponse {
  user: MahjongUser | null;
}

export interface WeChatMiniProgramLoginRequest {
  code: string;
}

export interface WeChatMiniProgramLoginResponse {
  user: MahjongUser;
  isNewUser: boolean;
}

export interface UpdateMahjongUserProfileRequest {
  name: string;
}

export interface MahjongSeat {
  seatIndex: number;
  userId: string;
  userName: string;
  joinedAt: string;
}

export interface MahjongTransaction {
  id: string;
  payerId: string;
  payerName: string;
  payeeType: 'user' | 'tea_fee';
  payeeId: string | null;
  payeeName: string | null;
  amount: string;
  remark: string | null;
  reversalOf: string | null;
  createdAt: string;
}

export interface MahjongRoomMember {
  userId: string;
  userName: string;
  joinedAt: string;
}

export interface MahjongRoomDetailResponse {
  room: {
    id: string;
    roomCode: string;
    name: string;
    mode: 'seated' | 'free';
    creatorUserId: string | null;
    createdAt: string;
    dissolvedAt: string | null;
  };
  seats: MahjongSeat[];
  members: MahjongRoomMember[];
  transactions: MahjongTransaction[];
  stats: {
    balances: { userId: string; userName: string; balance: string }[];
    teaFeeTotal: string;
    totalTurnover: string;
    balanceCheck: string;
  };
}

export interface CreateMahjongRoomRequest {
  roomCode?: string;
  name: string;
  creatorUserId?: string;
}

export interface CreateMahjongRoomResponse {
  room: {
    id: string;
    roomCode: string;
    name: string;
    createdAt: string;
  };
}

export interface SitDownRequest {
  userId: string;
  seatIndex: number;
}

export interface LeaveSeatRequest {
  userId: string;
}

export interface JoinRoomRequest {
  userId: string;
}

export interface LeaveRoomRequest {
  userId: string;
}

export interface UpdateRoomModeRequest {
  mode: 'seated' | 'free';
  operatorUserId: string;
}

export interface CreateTransactionRequest {
  payerId: string;
  payeeType: 'user' | 'tea_fee';
  payeeId?: string;
  amount: number;
  remark?: string;
  operatorUserId: string;
}

export interface ReverseTransactionRequest {
  operatorUserId: string;
}

export interface RoomVisitRecord {
  id: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  gameType: string;
  lastVisitedAt: string;
}

export interface GetRoomVisitsResponse {
  visits: RoomVisitRecord[];
}

export interface RecordRoomVisitRequest {
  deviceId: string;
  userId?: string;
  roomId: string;
  gameType: string;
  roomCode: string;
  roomName: string;
}

export interface RemoveRoomVisitRequest {
  deviceId: string;
  gameType: string;
  roomCode: string;
}
