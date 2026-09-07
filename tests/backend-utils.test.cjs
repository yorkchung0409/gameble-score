const assert = require('node:assert/strict');
const test = require('node:test');

const utils = require('../dist/server/common/utils.js');
const cloudDateTime = require('../dist/server/database/cloud-datetime.js');

test('room codes normalize and generated codes stay shareable', () => {
  assert.equal(utils.normalizeRoomCode(' ab12cd '), 'AB12CD');
  for (let index = 0; index < 100; index += 1) {
    assert.match(utils.generateRoomCode(), /^[A-Z0-9]{6}$/);
  }
});

test('currency validation rejects negative and sub-cent values', () => {
  assert.equal(utils.parseNonNegativeAmount(12.34, '金额'), 12.34);
  assert.throws(() => utils.parseNonNegativeAmount(-1, '金额'), /不能为负数/);
  assert.throws(() => utils.parseNonNegativeAmount(1.001, '金额'), /两位小数/);
  assert.equal(utils.fromCents(utils.toCents(12.34)), '12.34');
});

test('calendar date validation rejects rollover dates', () => {
  assert.equal(utils.parseCalendarDate('2026-09-06', '日期'), '2026-09-06');
  assert.throws(() => utils.parseCalendarDate('2026-02-30', '日期'), /有效日期/);
});

test('nested MySQL duplicate errors are recognized', () => {
  assert.equal(utils.isUniqueConstraintError({ cause: { code: 'ER_DUP_ENTRY' } }), true);
  assert.equal(utils.isUniqueConstraintError({ code: 'OTHER' }), false);
});

test('cloud DATETIME values round-trip between China time and UTC', () => {
  const instant = cloudDateTime.parseCloudDateTime('2026-09-05 23:06:07.123');
  assert.equal(instant.toISOString(), '2026-09-05T15:06:07.123Z');
  assert.equal(cloudDateTime.formatCloudDateTime(instant), '2026-09-05 23:06:07.123');
});
