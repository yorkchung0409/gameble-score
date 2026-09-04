/**
 * 后端公共工具函数
 */

import { BadRequestException } from '@nestjs/common';

/** 生成 6 位随机房间码（A-Z + 0-9） */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** 从嵌套驱动错误中提取数据库错误码。 */
export function extractDatabaseErrorCode(error: unknown): string | number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' || typeof code === 'number') return code;
    current = cause;
  }
  return undefined;
}

/** 规范化房间码：转大写并去空格 */
export function normalizeRoomCode(roomCode: string): string {
  return (roomCode || '').trim().toUpperCase();
}

/** 兼容数据库驱动的唯一约束冲突判定。 */
export function isUniqueConstraintError(error: unknown): boolean {
  const code = extractDatabaseErrorCode(error);
  return code === '23505' || code === 'ER_DUP_ENTRY' || code === 1062;
}

/** 严格校验 YYYY-MM-DD，避免由数据库抛出不稳定的日期格式错误。 */
export function parseCalendarDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${fieldName}格式必须为 YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${fieldName}不是有效日期`);
  }
  return value;
}

/**
 * 金额字段仅接受有限的 number，且精度最多两位小数。
 * 保持金额从请求进入系统起就是分级精度，避免把 1.234 静默四舍五入后写入账本。
 */
export function parseNonNegativeAmount(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${fieldName}不是有效数字`);
  }
  if (value < 0) {
    throw new BadRequestException(`${fieldName}不能为负数`);
  }

  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-8) {
    throw new BadRequestException(`${fieldName}最多支持两位小数`);
  }
  return cents / 100;
}

/** 将已校验或数据库读取的金额转为整数分，供统计和差额计算使用。 */
export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/** 将整数分转回 API 既有的金额字符串格式。 */
export function fromCents(value: number): string {
  return String(value / 100);
}
