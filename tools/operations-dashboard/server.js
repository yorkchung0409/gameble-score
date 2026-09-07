const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const mysql = require('mysql2');
const { loadConfig, validateDatabaseConfig } = require('./config');

const config = loadConfig();
validateDatabaseConfig(config);

const pool = mysql.createPool({
  host: config.dbHost,
  port: config.dbPort,
  user: config.dbUser,
  password: config.dbPassword,
  database: config.database,
  charset: 'utf8mb4',
  timezone: '+08:00',
  connectionLimit: 2,
  waitForConnections: true,
  queueLimit: 5,
  connectTimeout: 5000,
});
pool.on('connection', (connection) => connection.query("SET time_zone = '+08:00'"));
const database = pool.promise();
const publicDirectory = path.resolve(__dirname, 'public');

function countOf(rows) {
  return Number(rows[0]?.total || 0);
}

function amountOf(rows, key = 'amount') {
  return Number(rows[0]?.[key] || 0);
}

async function getOverview() {
  const [
    userRows,
    activeUserRows,
    mahjongRoomRows,
    pokerLedgerRows,
    activeMahjongRows,
    activePokerRows,
    hourlyTransactionRows,
    dailyTransactionRows,
    dailyReversalRows,
    dailyTeaFeeRows,
    recentRoomRows,
    overdueRoomRows,
  ] = await Promise.all([
    database.query(`
      SELECT
        COUNT(*) AS total,
        SUM(created_at >= DATE_SUB(NOW(6), INTERVAL 24 HOUR)) AS new_24h,
        SUM(created_at >= DATE_SUB(NOW(6), INTERVAL 7 DAY)) AS new_7d
      FROM users
    `).then(([rows]) => rows),
    database.query(`
      SELECT COUNT(DISTINCT user_id) AS total
      FROM (
        SELECT user_id FROM user_room_visits
        WHERE user_id IS NOT NULL AND last_visited_at >= DATE_SUB(NOW(6), INTERVAL 5 MINUTE)
        UNION
        SELECT user_id FROM mahjong_room_members
        WHERE joined_at >= DATE_SUB(NOW(6), INTERVAL 5 MINUTE)
        UNION
        SELECT payer_id AS user_id FROM mahjong_transactions
        WHERE created_at >= DATE_SUB(NOW(6), INTERVAL 5 MINUTE)
        UNION
        SELECT payee_id AS user_id FROM mahjong_transactions
        WHERE payee_id IS NOT NULL AND created_at >= DATE_SUB(NOW(6), INTERVAL 5 MINUTE)
      ) AS active_users
    `).then(([rows]) => rows),
    database.query('SELECT COUNT(*) AS total FROM mahjong_rooms').then(([rows]) => rows),
    database.query('SELECT COUNT(*) AS total FROM poker_ledger_owners').then(([rows]) => rows),
    database.query(`
      SELECT COUNT(DISTINCT mr.id) AS total
      FROM mahjong_rooms mr
      LEFT JOIN mahjong_transactions mt
        ON mt.room_id = mr.id
        AND mt.created_at >= DATE_SUB(NOW(6), INTERVAL 30 MINUTE)
      WHERE mr.dissolved_at IS NULL
        AND (mr.created_at >= DATE_SUB(NOW(6), INTERVAL 30 MINUTE) OR mt.id IS NOT NULL)
    `).then(([rows]) => rows),
    database.query(`
      SELECT COUNT(DISTINCT room_id) AS total
      FROM games
      WHERE created_at >= DATE_SUB(NOW(6), INTERVAL 30 MINUTE)
    `).then(([rows]) => rows),
    database.query(`SELECT COUNT(*) AS total FROM mahjong_transactions WHERE created_at >= DATE_SUB(NOW(6), INTERVAL 1 HOUR)`).then(([rows]) => rows),
    database.query(`SELECT COUNT(*) AS total FROM mahjong_transactions WHERE created_at >= DATE_SUB(NOW(6), INTERVAL 24 HOUR)`).then(([rows]) => rows),
    database.query(`
      SELECT COUNT(*) AS total FROM mahjong_transactions
      WHERE reversal_of IS NOT NULL AND created_at >= DATE_SUB(NOW(6), INTERVAL 24 HOUR)
    `).then(([rows]) => rows),
    database.query(`
      SELECT COUNT(*) AS total, COALESCE(SUM(t.amount), 0) AS amount
      FROM mahjong_transactions t
      LEFT JOIN mahjong_transactions reversal ON reversal.reversal_of = t.id
      WHERE t.payee_type = 'tea_fee'
        AND t.reversal_of IS NULL
        AND reversal.id IS NULL
        AND t.created_at >= DATE_SUB(NOW(6), INTERVAL 24 HOUR)
    `).then(([rows]) => rows),
    database.query(`
      SELECT
        mr.room_code AS roomCode,
        mr.name,
        mr.mode,
        mr.dissolved_at AS dissolvedAt,
        COALESCE(MAX(mt.created_at), mr.created_at) AS lastActivityAt,
        COUNT(mt.id) AS transactionCount
      FROM mahjong_rooms mr
      LEFT JOIN mahjong_transactions mt ON mt.room_id = mr.id
      GROUP BY mr.id, mr.room_code, mr.name, mr.mode, mr.dissolved_at, mr.created_at
      ORDER BY lastActivityAt DESC
      LIMIT 8
    `).then(([rows]) => rows),
    database.query(`
      SELECT
        mr.room_code AS roomCode,
        mr.name,
        COALESCE(MAX(mt.created_at), mr.created_at) AS lastActivityAt
      FROM mahjong_rooms mr
      LEFT JOIN mahjong_transactions mt ON mt.room_id = mr.id
      WHERE mr.dissolved_at IS NULL
      GROUP BY mr.id, mr.room_code, mr.name, mr.created_at
      HAVING lastActivityAt < DATE_SUB(NOW(6), INTERVAL 45 MINUTE)
      ORDER BY lastActivityAt ASC
      LIMIT 8
    `).then(([rows]) => rows),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: countOf(userRows),
      new24Hours: Number(userRows[0]?.new_24h || 0),
      new7Days: Number(userRows[0]?.new_7d || 0),
      active5Minutes: countOf(activeUserRows),
    },
    rooms: {
      mahjongTotal: countOf(mahjongRoomRows),
      pokerLedgerTotal: countOf(pokerLedgerRows),
      mahjongActive30Minutes: countOf(activeMahjongRows),
      pokerActive30Minutes: countOf(activePokerRows),
    },
    transactions: {
      lastHour: countOf(hourlyTransactionRows),
      last24Hours: countOf(dailyTransactionRows),
      reversals24Hours: countOf(dailyReversalRows),
      teaFeeCount24Hours: countOf(dailyTeaFeeRows),
      teaFeeAmount24Hours: amountOf(dailyTeaFeeRows),
    },
    recentMahjongRooms: recentRoomRows,
    overdueMahjongRooms: overdueRoomRows,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(response, filename, contentType) {
  fs.readFile(path.join(publicDirectory, filename), (error, content) => {
    if (error) {
      sendJson(response, 404, { message: 'Not found' });
      return;
    }
    response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', `http://${config.host}`).pathname;
  if (request.method !== 'GET') {
    sendJson(response, 405, { message: 'Method not allowed' });
    return;
  }
  if (pathname === '/api/overview') {
    try {
      sendJson(response, 200, await getOverview());
    } catch (error) {
      console.error('Operations dashboard query failed:', error);
      sendJson(response, 503, { message: '无法读取数据库，请检查本地只读连接配置。' });
    }
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(response, 'index.html', 'text/html; charset=utf-8');
    return;
  }
  if (pathname === '/dashboard.css') {
    serveStatic(response, 'dashboard.css', 'text/css; charset=utf-8');
    return;
  }
  if (pathname === '/dashboard.js') {
    serveStatic(response, 'dashboard.js', 'application/javascript; charset=utf-8');
    return;
  }
  sendJson(response, 404, { message: 'Not found' });
});

server.listen(config.port, config.host, () => {
  console.log(`Operations dashboard is listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
