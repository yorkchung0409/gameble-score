/**
 * 后端公共工具函数
 */

/** 生成 6 位随机房间码（A-Z + 0-9） */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** 从嵌套错误对象中提取 Postgres 错误码（如 23505 唯一冲突） */
export function extractPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

/** 规范化房间码：转大写并去空格 */
export function normalizeRoomCode(roomCode: string): string {
  return (roomCode || '').trim().toUpperCase();
}

/** 金额字段：仅允许最多两位小数的非负数字字符串，返回校验后的 number，非法抛错 */
export function parseNonNegativeAmount(value: number | undefined, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${fieldName}不是有效数字`);
  }
  if (n < 0) {
    throw new Error(`${fieldName}不能为负数`);
  }
  // 保留两位小数精度，避免浮点误差
  return Math.round(n * 100) / 100;
}
