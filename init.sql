CREATE TABLE IF NOT EXISTS rooms (
  id CHAR(36) PRIMARY KEY,
  room_code VARCHAR(50) NOT NULL UNIQUE,
  room_name VARCHAR(200) NOT NULL DEFAULT '牌局记账',
  game_type VARCHAR(20) NOT NULL DEFAULT 'texas',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS players (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT players_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_players_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  game_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT games_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_games_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_players (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  buy_in DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT game_players_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT game_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE KEY game_players_game_id_player_id_key (game_id, player_id),
  INDEX idx_game_players_game_id (game_id),
  INDEX idx_game_players_player_id (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_identities (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_subject VARCHAR(128) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY user_identities_provider_subject_key (provider, provider_subject),
  INDEX idx_user_identities_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poker_ledger_owners (
  room_id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  self_player_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT poker_ledger_owners_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT poker_ledger_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT poker_ledger_owners_self_player_id_fkey FOREIGN KEY (self_player_id) REFERENCES players(id) ON DELETE SET NULL,
  INDEX idx_poker_ledger_owners_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_rooms (
  id CHAR(36) PRIMARY KEY,
  room_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL DEFAULT '麻将房间',
  mode VARCHAR(20) NOT NULL DEFAULT 'seated',
  creator_user_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  dissolved_at DATETIME(6) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poker_ledger_snapshots (
  room_id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  game_count INT NOT NULL DEFAULT 0,
  archived_through DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT poker_ledger_snapshots_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT poker_ledger_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_poker_ledger_snapshots_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_user_snapshots (
  user_id CHAR(36) PRIMARY KEY,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  win_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  loss_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  tea_fee_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  archived_through DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT mahjong_user_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_opponent_snapshots (
  id VARCHAR(73) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  opponent_user_id CHAR(36) NOT NULL,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  win_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  loss_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  room_count INT NOT NULL DEFAULT 0,
  archived_through DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT mahjong_opponent_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT mahjong_opponent_snapshots_opponent_user_id_fkey FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY mahjong_opponent_snapshots_user_opponent_key (user_id, opponent_user_id),
  INDEX idx_mahjong_opponent_snapshots_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_room_members (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT mahjong_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  CONSTRAINT mahjong_room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY mahjong_room_members_room_id_user_id_key (room_id, user_id),
  INDEX idx_mahjong_room_members_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_seats (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  seat_index SMALLINT NOT NULL,
  user_id CHAR(36) NOT NULL,
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT mahjong_seats_room_id_fkey FOREIGN KEY (room_id) REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  CONSTRAINT mahjong_seats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY mahjong_seats_room_id_seat_index_key (room_id, seat_index),
  UNIQUE KEY mahjong_seats_room_id_user_id_key (room_id, user_id),
  INDEX idx_mahjong_seats_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mahjong_transactions (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  payer_id CHAR(36) NOT NULL,
  payee_type VARCHAR(20) NOT NULL,
  payee_id CHAR(36) NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  remark VARCHAR(500) NULL,
  reversal_of CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT mahjong_transactions_room_id_fkey FOREIGN KEY (room_id) REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
  CONSTRAINT mahjong_transactions_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT mahjong_transactions_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY mahjong_transactions_reversal_of_key (reversal_of),
  INDEX idx_mahjong_transactions_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_room_visits (
  id CHAR(36) PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,
  user_id CHAR(36) NULL,
  room_id CHAR(36) NOT NULL,
  game_type VARCHAR(20) NOT NULL DEFAULT 'texas',
  room_code VARCHAR(50) NOT NULL,
  room_name VARCHAR(200) NOT NULL,
  last_visited_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY user_room_visits_device_room_game_key (device_id, room_id, game_type),
  INDEX idx_user_room_visits_device_game (device_id, game_type, last_visited_at),
  INDEX idx_user_room_visits_user_game (user_id, game_type, last_visited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
