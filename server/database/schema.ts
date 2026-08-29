import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';

// ========== 德州模块 ==========

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: varchar('room_code', { length: 50 }).notNull().unique(),
    roomName: varchar('room_name', { length: 200 }).notNull().default('牌局记账'),
    gameType: varchar('game_type', { length: 20 }).notNull().default('texas'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('rooms_room_code_key').on(table.roomCode)],
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_players_room_id').on(table.roomId),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [rooms.id],
      name: 'players_room_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    gameDate: date('game_date').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_games_room_id').on(table.roomId),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [rooms.id],
      name: 'games_room_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const gamePlayers = pgTable(
  'game_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id').notNull(),
    playerId: uuid('player_id').notNull(),
    buyIn: numeric('buy_in').notNull().default('0'),
    balance: numeric('balance').notNull().default('0'),
    netProfit: numeric('net_profit').notNull().default('0'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_game_players_game_id').on(table.gameId),
    index('idx_game_players_player_id').on(table.playerId),
    foreignKey({
      columns: [table.gameId],
      foreignColumns: [games.id],
      name: 'game_players_game_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_players_player_id_fkey',
    }).onDelete('cascade'),
  ],
);

// ========== 麻将模块 ==========

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    deviceId: varchar('device_id', { length: 100 }).notNull().unique(),
    createdAt: timestamp('created_at', { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('users_name_key').on(table.name),
    uniqueIndex('users_device_id_key').on(table.deviceId),
  ],
);

export const mahjongRooms = pgTable(
  'mahjong_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: varchar('room_code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull().default('麻将房间'),
    createdAt: timestamp('created_at', { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('mahjong_rooms_room_code_key').on(table.roomCode)],
);

export const mahjongSeats = pgTable(
  'mahjong_seats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    seatIndex: smallint('seat_index').notNull(),
    userId: uuid('user_id').notNull(),
    joinedAt: timestamp('joined_at', { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('mahjong_seats_room_id_seat_index_key').on(table.roomId, table.seatIndex),
    uniqueIndex('mahjong_seats_room_id_user_id_key').on(table.roomId, table.userId),
    index('idx_mahjong_seats_room_id').on(table.roomId),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [mahjongRooms.id],
      name: 'mahjong_seats_room_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'mahjong_seats_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const mahjongTransactions = pgTable(
  'mahjong_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    payerId: uuid('payer_id').notNull(),
    payeeType: varchar('payee_type', { length: 20 }).notNull(),
    payeeId: uuid('payee_id'),
    amount: numeric('amount').notNull().default('0'),
    remark: varchar('remark', { length: 500 }),
    reversalOf: uuid('reversal_of'),
    createdAt: timestamp('created_at', { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_mahjong_transactions_room_id').on(table.roomId),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [mahjongRooms.id],
      name: 'mahjong_transactions_room_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.payerId],
      foreignColumns: [users.id],
      name: 'mahjong_transactions_payer_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.payeeId],
      foreignColumns: [users.id],
      name: 'mahjong_transactions_payee_id_fkey',
    }).onDelete('cascade'),
  ],
);

// ========== 房间访问历史 ==========

export const userRoomVisits = pgTable(
  'user_room_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    userId: uuid('user_id'),
    roomId: uuid('room_id').notNull(),
    gameType: varchar('game_type', { length: 20 }).notNull().default('texas'),
    roomCode: varchar('room_code', { length: 50 }).notNull(),
    roomName: varchar('room_name', { length: 200 }).notNull(),
    lastVisitedAt: timestamp('last_visited_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('user_room_visits_device_room_game_key').on(table.deviceId, table.roomId, table.gameType),
    index('idx_user_room_visits_device_game').on(table.deviceId, table.gameType, table.lastVisitedAt),
    index('idx_user_room_visits_user_game').on(table.userId, table.gameType, table.lastVisitedAt),
  ],
);

// table aliases
export const gamePlayersTable = gamePlayers;
export const gamesTable = games;
export const mahjongRoomsTable = mahjongRooms;
export const mahjongSeatsTable = mahjongSeats;
export const mahjongTransactionsTable = mahjongTransactions;
export const playersTable = players;
export const roomsTable = rooms;
export const userRoomVisitsTable = userRoomVisits;
export const usersTable = users;
