const mysql = require('mysql2/promise');

const MIGRATION_VERSION = '20260909_007_threshold_tea_fee';
const MIGRATION_LOCK = 'gameble_score_schema_migration';

function getCloudMySqlAddress() {
  const address = process.env.MYSQL_ADDRESS && process.env.MYSQL_ADDRESS.trim();
  if (!address) return {};
  const separatorIndex = address.lastIndexOf(':');
  if (separatorIndex === -1) return { host: address };
  return {
    host: address.slice(0, separatorIndex).trim(),
    port: address.slice(separatorIndex + 1).trim(),
  };
}

function getConfig() {
  const cloudAddress = getCloudMySqlAddress();
  const host = (process.env.DB_HOST && process.env.DB_HOST.trim()) || cloudAddress.host;
  const user = (process.env.DB_USER && process.env.DB_USER.trim())
    || (process.env.MYSQL_USERNAME && process.env.MYSQL_USERNAME.trim());
  const database = process.env.DB_NAME && process.env.DB_NAME.trim();
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD;
  const port = Number(process.env.DB_PORT || cloudAddress.port || '3306');
  if (!host || !user || !database || password === undefined) {
    throw new Error('MySQL configuration is incomplete. Set DB_NAME and the cloud MYSQL_* variables.');
  }
  return { host, port, user, password, database, charset: 'utf8mb4' };
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tableName, columnName],
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [tableName, indexName],
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function addColumn(connection, tableName, columnName, definition) {
  if (await columnExists(connection, tableName, columnName)) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function addIndex(connection, tableName, indexName, columns, unique = false) {
  if (await indexExists(connection, tableName, indexName)) return;
  const columnSql = columns.map((column) => `\`${column}\``).join(', ');
  await connection.query(
    `ALTER TABLE \`${tableName}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` (${columnSql})`,
  );
}

async function generateDefaultUserName(connection, usedNames) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `微信用户${1000 + Math.floor(Math.random() * 9000)}`;
    if (usedNames.has(candidate)) continue;
    usedNames.add(candidate);
    return candidate;
  }
  throw new Error('Unable to generate a unique default user name during migration.');
}

async function normalizeLegacyDefaultNames(connection) {
  const [rows] = await connection.query("SELECT id, name FROM users WHERE name = '微信用户' ORDER BY created_at, id FOR UPDATE");
  if (!rows.length) return;
  const [nameRows] = await connection.query('SELECT name FROM users');
  const usedNames = new Set(nameRows.map((row) => row.name));
  for (const row of rows) {
    const nextName = await generateDefaultUserName(connection, usedNames);
    await connection.execute('UPDATE users SET name = ? WHERE id = ?', [nextName, row.id]);
  }
}

async function assertNamesUnique(connection) {
  const [duplicates] = await connection.query('SELECT name, COUNT(*) AS total FROM users GROUP BY name HAVING total > 1 LIMIT 1');
  if (duplicates[0]) {
    throw new Error(`Duplicate user nickname exists: ${duplicates[0].name}. Rename duplicates before enabling unique nicknames.`);
  }
}

async function applyCurrentMigration(connection) {
  await normalizeLegacyDefaultNames(connection);
  await assertNamesUnique(connection);
  await addColumn(connection, 'rooms', 'create_operation_id', 'VARCHAR(80) NULL AFTER `game_type`');
  await addColumn(connection, 'mahjong_rooms', 'create_operation_id', 'VARCHAR(80) NULL AFTER `creator_user_id`');
  await addColumn(connection, 'mahjong_room_members', 'left_at', 'DATETIME(6) NULL AFTER `joined_at`');
  await addColumn(connection, 'mahjong_transactions', 'operation_id', 'VARCHAR(80) NULL AFTER `room_id`');
  await addColumn(connection, 'mahjong_transactions', 'transaction_type', "VARCHAR(40) NOT NULL DEFAULT 'manual' AFTER `operation_id`");
  await addColumn(connection, 'mahjong_transactions', 'auto_fee_rule_version', 'INT NULL AFTER `transaction_type`');
  await addColumn(connection, 'mahjong_transactions', 'auto_fee_mode', 'VARCHAR(20) NULL AFTER `auto_fee_rule_version`');
  await addColumn(connection, 'mahjong_transactions', 'auto_fee_threshold_amount', 'DECIMAL(14,2) NULL AFTER `auto_fee_mode`');
  await addColumn(connection, 'mahjong_transactions', 'auto_fee_rate_percent', 'INT NULL AFTER `auto_fee_threshold_amount`');
  await addColumn(connection, 'mahjong_transactions', 'auto_fee_amount', 'DECIMAL(14,2) NULL AFTER `auto_fee_rate_percent`');
  await addColumn(connection, 'games', 'operation_id', 'VARCHAR(80) NULL AFTER `room_id`');

  await addIndex(connection, 'mahjong_transactions', 'mahjong_transactions_operation_id_key', ['operation_id'], true);
  await addIndex(connection, 'games', 'games_operation_id_key', ['operation_id'], true);
  await addIndex(connection, 'rooms', 'rooms_create_operation_id_key', ['create_operation_id'], true);
  await addIndex(connection, 'mahjong_rooms', 'mahjong_rooms_create_operation_id_key', ['create_operation_id'], true);
  await addIndex(connection, 'users', 'users_name_key', ['name'], true);
  await addIndex(connection, 'games', 'idx_games_created_at_id', ['created_at', 'id']);
  await addIndex(connection, 'mahjong_room_members', 'idx_mahjong_room_members_user_joined', ['user_id', 'joined_at']);
  await addIndex(connection, 'mahjong_room_members', 'idx_mahjong_room_members_user_active', ['user_id', 'left_at', 'joined_at']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_room_created', ['room_id', 'created_at']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_payer_created', ['payer_id', 'created_at']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_payee_created', ['payee_id', 'created_at']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_created_id', ['created_at', 'id']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_room_type', ['room_id', 'transaction_type', 'created_at']);
  await addIndex(connection, 'mahjong_transactions', 'idx_mahjong_transactions_auto_rule', ['room_id', 'auto_fee_rule_version', 'transaction_type']);
  await addIndex(connection, 'mahjong_rooms', 'idx_mahjong_rooms_dissolved_created', ['dissolved_at', 'created_at']);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mahjong_tea_fee_rules (
      room_id CHAR(36) PRIMARY KEY,
      enabled TINYINT NOT NULL DEFAULT 0,
      mode VARCHAR(20) NOT NULL DEFAULT 'percentage',
      threshold_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      rate_percent INT NOT NULL DEFAULT 10,
      fee_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 1,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      CONSTRAINT mahjong_tea_fee_rules_room_fkey FOREIGN KEY (room_id) REFERENCES mahjong_rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumn(connection, 'mahjong_tea_fee_rules', 'fee_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `rate_percent`');
  await connection.query(`
    UPDATE mahjong_tea_fee_rules
       SET mode = CASE mode
         WHEN 'per_player' THEN 'percentage'
         WHEN 'shared_total' THEN 'threshold'
         ELSE mode
       END
     WHERE mode IN ('per_player', 'shared_total')
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mahjong_opponent_snapshot_rooms (
      id VARCHAR(110) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      opponent_user_id CHAR(36) NOT NULL,
      room_id CHAR(36) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      CONSTRAINT mahjong_opponent_snapshot_rooms_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT mahjong_opponent_snapshot_rooms_opponent_fkey FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT mahjong_opponent_snapshot_rooms_room_fkey FOREIGN KEY (room_id) REFERENCES mahjong_rooms(id) ON DELETE CASCADE,
      UNIQUE KEY mahjong_opponent_snapshot_rooms_key (user_id, opponent_user_id, room_id),
      INDEX idx_mahjong_opponent_snapshot_rooms_pair (user_id, opponent_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS mahjong_room_revisions (
      room_code VARCHAR(50) PRIMARY KEY,
      version INT NOT NULL DEFAULT 0,
      stats_version INT NOT NULL DEFAULT -1,
      stats_total_turnover DECIMAL(14,2) NOT NULL DEFAULT 0,
      stats_tea_fee_total DECIMAL(14,2) NOT NULL DEFAULT 0,
      stats_balances_json LONGTEXT NULL,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      INDEX idx_mahjong_room_revisions_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumn(connection, 'mahjong_room_revisions', 'stats_version', 'INT NOT NULL DEFAULT -1 AFTER `version`');
  await addColumn(connection, 'mahjong_room_revisions', 'stats_total_turnover', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `stats_version`');
  await addColumn(connection, 'mahjong_room_revisions', 'stats_tea_fee_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `stats_total_turnover`');
  await addColumn(connection, 'mahjong_room_revisions', 'stats_balances_json', 'LONGTEXT NULL AFTER `stats_tea_fee_total`');
}

async function main() {
  let connection;
  let lockAcquired = false;
  try {
    connection = await mysql.createConnection(getConfig());
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [MIGRATION_LOCK]);
    lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
    if (!lockAcquired) throw new Error('Timed out waiting for the schema migration lock.');

    await connection.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    );
    const [versions] = await connection.execute(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [MIGRATION_VERSION],
    );
    if (versions.length === 0) {
      await applyCurrentMigration(connection);
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [MIGRATION_VERSION]);
      console.log(`Applied database migration ${MIGRATION_VERSION}`);
    } else {
      console.log('Database schema is up to date');
    }
  } catch (error) {
    console.error('Failed to migrate MySQL schema:', error);
    process.exitCode = 1;
  } finally {
    if (connection && lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK]).catch(() => null);
    }
    if (connection) await connection.end();
  }
}

main();
