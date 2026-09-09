const assert = require('node:assert/strict');
const test = require('node:test');

const { calculatePerPlayerTeaFeeCents, calculateThresholdTeaFeeCents } = require('../dist/server/modules/mahjong/tea-fee.js');

test('single-player tea fee stays off below the threshold', () => {
  assert.equal(calculatePerPlayerTeaFeeCents(1999, 2000, 5), 0);
  assert.equal(calculatePerPlayerTeaFeeCents(2000, 2000, 5), 100);
});

test('percentage tea fee never rounds a fractional cent up', () => {
  assert.equal(calculatePerPlayerTeaFeeCents(10000, 0, 5), 500);
  assert.equal(calculatePerPlayerTeaFeeCents(10001, 0, 5), 500);
});

test('threshold tea fee charges once for each full threshold reached', () => {
  assert.equal(calculateThresholdTeaFeeCents(1000, 1000, 100), 100);
  assert.equal(calculateThresholdTeaFeeCents(1900, 1000, 100), 100);
  assert.equal(calculateThresholdTeaFeeCents(2900, 1000, 100), 200);
});

test('reversing one payer removes only that payer fee', () => {
  const firstRound = [10000, 5000, 3000];
  const totalBefore = firstRound.reduce(
    (sum, amount) => sum + calculatePerPlayerTeaFeeCents(amount, 2000, 5),
    0,
  );
  const totalAfter = firstRound.slice(1).reduce(
    (sum, amount) => sum + calculatePerPlayerTeaFeeCents(amount, 2000, 5),
    0,
  );
  assert.equal(totalBefore, 900);
  assert.equal(totalAfter, 400);
});
