const assert = require('node:assert/strict');
const test = require('node:test');

const { calculatePerPlayerTeaFeeCents } = require('../dist/server/modules/mahjong/tea-fee.js');

test('single-player tea fee stays off below the threshold', () => {
  assert.equal(calculatePerPlayerTeaFeeCents(1999, 2000, 5), 0);
  assert.equal(calculatePerPlayerTeaFeeCents(2000, 2000, 5), 100);
});

test('single-player tea fee rounds up to the cent', () => {
  assert.equal(calculatePerPlayerTeaFeeCents(10000, 0, 5), 500);
  assert.equal(calculatePerPlayerTeaFeeCents(10001, 0, 5), 501);
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
