import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import {
  date,
  decimal,
  foreignKey,
  int,
  index,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { cloudDateTime } from './cloud-datetime';

const id = () =>
  varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const rooms = mysqlTable(
  'rooms',
  {
    id: id(),
    roomCode: varchar('room_code', { length: 50 }).notNull().unique(),
    roomName: varchar('room_name', { length: 200 }).notNull().default('牌局记账'),
    gameType: varchar('game_type', { length: 20 }).notNull().default('texas'),
    createOperationId: varchar('create_operation_id', { length: 80 }),
    createdAt: cloudDateTime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: cloudDateTime('updated_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('rooms_room_code_key').on(table.roomCode),
    uniqueIndex('rooms_create_operation_id_key').on(table.createOperationId),
  ],
);

export const players = mysqlTable(
  'players',
  {
    id: id(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: cloudDateTime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    index('idx_players_room_id').on(table.roomId),
    foreignKey({ columns: [table.roomId], foreignColumns: [rooms.id], name: 'players_room_id_fkey' }).onDelete('cascade'),
  ],
);

export const games = mysqlTable(
  'games',
  {
    id: id(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    operationId: varchar('operation_id', { length: 80 }),
    gameDate: date('game_date', { mode: 'string' }).notNull(),
    createdAt: cloudDateTime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('games_operation_id_key').on(table.operationId),
    index('idx_games_room_id').on(table.roomId),
    index('idx_games_created_at_id').on(table.createdAt, table.id),
    foreignKey({ columns: [table.roomId], foreignColumns: [rooms.id], name: 'games_room_id_fkey' }).onDelete('cascade'),
  ],
);

export const gamePlayers = mysqlTable(
  'game_players',
  {
    id: id(),
    gameId: varchar('game_id', { length: 36 }).notNull(),
    playerId: varchar('player_id', { length: 36 }).notNull(),
    buyIn: decimal('buy_in', { precision: 14, scale: 2 }).notNull().default('0'),
    balance: decimal('balance', { precision: 14, scale: 2 }).notNull().default('0'),
    netProfit: decimal('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
    createdAt: cloudDateTime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('game_players_game_id_player_id_key').on(table.gameId, table.playerId),
    index('idx_game_players_game_id').on(table.gameId),
    index('idx_game_players_player_id').on(table.playerId),
    foreignKey({ columns: [table.gameId], foreignColumns: [games.id], name: 'game_players_game_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.playerId], foreignColumns: [players.id], name: 'game_players_player_id_fkey' }).onDelete('cascade'),
  ],
);

export const users = mysqlTable(
  'users',
  {
    id: id(),
    name: varchar('name', { length: 100 }).notNull(),
    deviceId: varchar('device_id', { length: 100 }).notNull().unique(),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('users_device_id_key').on(table.deviceId),
    uniqueIndex('users_name_key').on(table.name),
  ],
);

export const userIdentities = mysqlTable(
  'user_identities',
  {
    id: id(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    provider: varchar('provider', { length: 30 }).notNull(),
    providerSubject: varchar('provider_subject', { length: 128 }).notNull(),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('user_identities_provider_subject_key').on(table.provider, table.providerSubject),
    index('idx_user_identities_user_id').on(table.userId),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'user_identities_user_id_fkey' }).onDelete('cascade'),
  ],
);

/**
 * 小程序扑克账本是创建者私有的手工账本。参与者只存在于账本内，
 * 不与微信身份绑定；selfPlayerId 仅标记账本所有者在名单中对应谁。
 */
export const pokerLedgerOwners = mysqlTable(
  'poker_ledger_owners',
  {
    roomId: varchar('room_id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    selfPlayerId: varchar('self_player_id', { length: 36 }),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    index('idx_poker_ledger_owners_user_id').on(table.userId),
    foreignKey({ columns: [table.roomId], foreignColumns: [rooms.id], name: 'poker_ledger_owners_room_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'poker_ledger_owners_user_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.selfPlayerId], foreignColumns: [players.id], name: 'poker_ledger_owners_self_player_id_fkey' }).onDelete('set null'),
  ],
);

/** Historical poker totals retained after old game rows are purged. */
export const pokerLedgerSnapshots = mysqlTable(
  'poker_ledger_snapshots',
  {
    roomId: varchar('room_id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    netProfit: decimal('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
    gameCount: int('game_count').notNull().default(0),
    archivedThrough: cloudDateTime('archived_through', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    updatedAt: cloudDateTime('updated_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    index('idx_poker_ledger_snapshots_user_id').on(table.userId),
    foreignKey({ columns: [table.roomId], foreignColumns: [rooms.id], name: 'poker_ledger_snapshots_room_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'poker_ledger_snapshots_user_id_fkey' }).onDelete('cascade'),
  ],
);

/** Historical Mahjong totals retained after old transaction rows are purged. */
export const mahjongUserSnapshots = mysqlTable(
  'mahjong_user_snapshots',
  {
    userId: varchar('user_id', { length: 36 }).primaryKey(),
    netProfit: decimal('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
    winTotal: decimal('win_total', { precision: 14, scale: 2 }).notNull().default('0'),
    lossTotal: decimal('loss_total', { precision: 14, scale: 2 }).notNull().default('0'),
    teaFeeTotal: decimal('tea_fee_total', { precision: 14, scale: 2 }).notNull().default('0'),
    archivedThrough: cloudDateTime('archived_through', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    updatedAt: cloudDateTime('updated_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'mahjong_user_snapshots_user_id_fkey' }).onDelete('cascade'),
  ],
);

/** Per-user opponent totals retained after old Mahjong transaction rows are purged. */
export const mahjongOpponentSnapshots = mysqlTable(
  'mahjong_opponent_snapshots',
  {
    id: varchar('id', { length: 73 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    opponentUserId: varchar('opponent_user_id', { length: 36 }).notNull(),
    netProfit: decimal('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
    winTotal: decimal('win_total', { precision: 14, scale: 2 }).notNull().default('0'),
    lossTotal: decimal('loss_total', { precision: 14, scale: 2 }).notNull().default('0'),
    transactionCount: int('transaction_count').notNull().default(0),
    roomCount: int('room_count').notNull().default(0),
    archivedThrough: cloudDateTime('archived_through', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    updatedAt: cloudDateTime('updated_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('mahjong_opponent_snapshots_user_opponent_key').on(table.userId, table.opponentUserId),
    index('idx_mahjong_opponent_snapshots_user_id').on(table.userId),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'mahjong_opponent_snapshots_user_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.opponentUserId], foreignColumns: [users.id], name: 'mahjong_opponent_snapshots_opponent_user_id_fkey' }).onDelete('cascade'),
  ],
);

export const mahjongRooms = mysqlTable(
  'mahjong_rooms',
  {
    id: id(),
    roomCode: varchar('room_code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull().default('麻将房间'),
    mode: varchar('mode', { length: 20 }).notNull().default('seated'),
    creatorUserId: varchar('creator_user_id', { length: 36 }),
    createOperationId: varchar('create_operation_id', { length: 80 }),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    dissolvedAt: cloudDateTime('dissolved_at', { fsp: 6 }),
  },
  (table) => [
    uniqueIndex('mahjong_rooms_room_code_key').on(table.roomCode),
    uniqueIndex('mahjong_rooms_create_operation_id_key').on(table.createOperationId),
    index('idx_mahjong_rooms_dissolved_created').on(table.dissolvedAt, table.createdAt),
  ],
);

/** Current automatic tea-fee rule for a Mahjong room. Historical settings are
 * copied onto transactions so changing the rule never rewrites old records. */
export const mahjongTeaFeeRules = mysqlTable(
  'mahjong_tea_fee_rules',
  {
    roomId: varchar('room_id', { length: 36 }).primaryKey(),
    enabled: tinyint('enabled').notNull().default(0),
    mode: varchar('mode', { length: 20 }).notNull().default('percentage'),
    thresholdAmount: decimal('threshold_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    ratePercent: int('rate_percent').notNull().default(10),
    feeAmount: decimal('fee_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    version: int('version').notNull().default(1),
    updatedAt: cloudDateTime('updated_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    foreignKey({ columns: [table.roomId], foreignColumns: [mahjongRooms.id], name: 'mahjong_tea_fee_rules_room_fkey' }).onDelete('cascade'),
  ],
);

/** Shared room revisions allow realtime notifications to cross container instances. */
export const mahjongRoomRevisions = mysqlTable(
  'mahjong_room_revisions',
  {
    roomCode: varchar('room_code', { length: 50 }).primaryKey(),
    version: int('version').notNull().default(0),
    statsVersion: int('stats_version').notNull().default(-1),
    statsTotalTurnover: decimal('stats_total_turnover', { precision: 14, scale: 2 }).notNull().default('0'),
    statsTeaFeeTotal: decimal('stats_tea_fee_total', { precision: 14, scale: 2 }).notNull().default('0'),
    statsBalancesJson: text('stats_balances_json'),
    updatedAt: cloudDateTime('updated_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [index('idx_mahjong_room_revisions_updated').on(table.updatedAt)],
);

/** Tracks which rooms have already contributed to an archived opponent room count. */
export const mahjongOpponentSnapshotRooms = mysqlTable(
  'mahjong_opponent_snapshot_rooms',
  {
    id: varchar('id', { length: 110 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    opponentUserId: varchar('opponent_user_id', { length: 36 }).notNull(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('mahjong_opponent_snapshot_rooms_key').on(table.userId, table.opponentUserId, table.roomId),
    index('idx_mahjong_opponent_snapshot_rooms_pair').on(table.userId, table.opponentUserId),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'mahjong_opponent_snapshot_rooms_user_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.opponentUserId], foreignColumns: [users.id], name: 'mahjong_opponent_snapshot_rooms_opponent_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.roomId], foreignColumns: [mahjongRooms.id], name: 'mahjong_opponent_snapshot_rooms_room_fkey' }).onDelete('cascade'),
  ],
);

export const mahjongRoomMembers = mysqlTable(
  'mahjong_room_members',
  {
    id: id(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    joinedAt: cloudDateTime('joined_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    leftAt: cloudDateTime('left_at', { fsp: 6 }),
  },
  (table) => [
    uniqueIndex('mahjong_room_members_room_id_user_id_key').on(table.roomId, table.userId),
    index('idx_mahjong_room_members_room_id').on(table.roomId),
    index('idx_mahjong_room_members_user_joined').on(table.userId, table.joinedAt),
    index('idx_mahjong_room_members_user_active').on(table.userId, table.leftAt, table.joinedAt),
    foreignKey({ columns: [table.roomId], foreignColumns: [mahjongRooms.id], name: 'mahjong_room_members_room_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'mahjong_room_members_user_id_fkey' }).onDelete('cascade'),
  ],
);

export const mahjongSeats = mysqlTable(
  'mahjong_seats',
  {
    id: id(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    seatIndex: smallint('seat_index').notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    joinedAt: cloudDateTime('joined_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('mahjong_seats_room_id_seat_index_key').on(table.roomId, table.seatIndex),
    uniqueIndex('mahjong_seats_room_id_user_id_key').on(table.roomId, table.userId),
    index('idx_mahjong_seats_room_id').on(table.roomId),
    foreignKey({ columns: [table.roomId], foreignColumns: [mahjongRooms.id], name: 'mahjong_seats_room_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'mahjong_seats_user_id_fkey' }).onDelete('cascade'),
  ],
);

export const mahjongTransactions = mysqlTable(
  'mahjong_transactions',
  {
    id: id(),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    operationId: varchar('operation_id', { length: 80 }),
    transactionType: varchar('transaction_type', { length: 40 }).notNull().default('manual'),
    autoFeeRuleVersion: int('auto_fee_rule_version'),
    autoFeeMode: varchar('auto_fee_mode', { length: 20 }),
    autoFeeThresholdAmount: decimal('auto_fee_threshold_amount', { precision: 14, scale: 2 }),
    autoFeeRatePercent: int('auto_fee_rate_percent'),
    autoFeeAmount: decimal('auto_fee_amount', { precision: 14, scale: 2 }),
    payerId: varchar('payer_id', { length: 36 }).notNull(),
    payeeType: varchar('payee_type', { length: 20 }).notNull(),
    payeeId: varchar('payee_id', { length: 36 }),
    amount: decimal('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    remark: varchar('remark', { length: 500 }),
    reversalOf: varchar('reversal_of', { length: 36 }),
    createdAt: cloudDateTime('created_at', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    uniqueIndex('mahjong_transactions_operation_id_key').on(table.operationId),
    uniqueIndex('mahjong_transactions_reversal_of_key').on(table.reversalOf),
    index('idx_mahjong_transactions_room_id').on(table.roomId),
    index('idx_mahjong_transactions_room_created').on(table.roomId, table.createdAt),
    index('idx_mahjong_transactions_payer_created').on(table.payerId, table.createdAt),
    index('idx_mahjong_transactions_payee_created').on(table.payeeId, table.createdAt),
    index('idx_mahjong_transactions_created_id').on(table.createdAt, table.id),
    foreignKey({ columns: [table.roomId], foreignColumns: [mahjongRooms.id], name: 'mahjong_transactions_room_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.payerId], foreignColumns: [users.id], name: 'mahjong_transactions_payer_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.payeeId], foreignColumns: [users.id], name: 'mahjong_transactions_payee_id_fkey' }).onDelete('cascade'),
  ],
);

export const userRoomVisits = mysqlTable(
  'user_room_visits',
  {
    id: id(),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    userId: varchar('user_id', { length: 36 }),
    roomId: varchar('room_id', { length: 36 }).notNull(),
    gameType: varchar('game_type', { length: 20 }).notNull().default('texas'),
    roomCode: varchar('room_code', { length: 50 }).notNull(),
    roomName: varchar('room_name', { length: 200 }).notNull(),
    lastVisitedAt: cloudDateTime('last_visited_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    createdAt: cloudDateTime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('user_room_visits_device_room_game_key').on(table.deviceId, table.roomId, table.gameType),
    index('idx_user_room_visits_device_game').on(table.deviceId, table.gameType, table.lastVisitedAt),
    index('idx_user_room_visits_user_game').on(table.userId, table.gameType, table.lastVisitedAt),
  ],
);

export const gamePlayersTable = gamePlayers;
export const gamesTable = games;
export const mahjongRoomsTable = mahjongRooms;
export const mahjongRoomRevisionsTable = mahjongRoomRevisions;
export const mahjongRoomMembersTable = mahjongRoomMembers;
export const mahjongSeatsTable = mahjongSeats;
export const mahjongTransactionsTable = mahjongTransactions;
export const playersTable = players;
export const pokerLedgerOwnersTable = pokerLedgerOwners;
export const roomsTable = rooms;
export const userRoomVisitsTable = userRoomVisits;
export const usersTable = users;
export const userIdentitiesTable = userIdentities;
export const pokerLedgerSnapshotsTable = pokerLedgerSnapshots;
export const mahjongUserSnapshotsTable = mahjongUserSnapshots;
export const mahjongOpponentSnapshotsTable = mahjongOpponentSnapshots;
export const mahjongOpponentSnapshotRoomsTable = mahjongOpponentSnapshotRooms;
