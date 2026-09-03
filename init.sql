-- 牌局记账应用数据库初始化脚本
-- PostgreSQL

-- 德州模块
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) NOT NULL UNIQUE,
  room_name VARCHAR(200) NOT NULL DEFAULT '牌局记账',
  game_type VARCHAR(20) NOT NULL DEFAULT 'texas',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);

CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  buy_in NUMERIC NOT NULL DEFAULT '0',
  balance NUMERIC NOT NULL DEFAULT '0',
  net_profit NUMERIC NOT NULL DEFAULT '0',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player_id ON game_players(player_id);
CREATE UNIQUE INDEX IF NOT EXISTS game_players_game_id_player_id_key ON game_players(game_id, player_id);

-- 麻将模块
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mahjong_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL DEFAULT '麻将房间',
  mode VARCHAR(20) NOT NULL DEFAULT 'seated',
  creator_user_id UUID,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mahjong_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mahjong_room_members_room_id ON mahjong_room_members(room_id);

CREATE TABLE IF NOT EXISTS mahjong_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  seat_index SMALLINT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, seat_index),
  UNIQUE(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mahjong_seats_room_id ON mahjong_seats(room_id);

CREATE TABLE IF NOT EXISTS mahjong_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payee_type VARCHAR(20) NOT NULL,
  payee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT '0',
  remark VARCHAR(500),
  reversal_of UUID,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mahjong_transactions_room_id ON mahjong_transactions(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS mahjong_transactions_reversal_of_key ON mahjong_transactions(reversal_of);

-- 房间访问历史
CREATE TABLE IF NOT EXISTS user_room_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(100) NOT NULL,
  user_id UUID,
  room_id UUID NOT NULL,
  game_type VARCHAR(20) NOT NULL DEFAULT 'texas',
  room_code VARCHAR(50) NOT NULL,
  room_name VARCHAR(200) NOT NULL,
  last_visited_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id, room_id, game_type)
);
CREATE INDEX IF NOT EXISTS idx_user_room_visits_device_game ON user_room_visits(device_id, game_type, last_visited_at);
CREATE INDEX IF NOT EXISTS idx_user_room_visits_user_game ON user_room_visits(user_id, game_type, last_visited_at);
