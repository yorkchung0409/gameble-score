// 数据库初始化脚本：在部署启动时执行 init.sql（幂等，可重复运行）
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const schemaSql = fs.readFileSync(
      path.join(__dirname, '..', 'init.sql'),
      'utf8',
    );
    await sql.unsafe(schemaSql);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
