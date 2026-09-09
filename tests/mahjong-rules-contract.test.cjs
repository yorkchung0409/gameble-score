const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const rules = require('../shared/mahjong-rules.js');
const cloudCore = require(path.resolve(__dirname, '..', 'cloud-functions', 'gameble-bootstrap-probe', 'mahjong-core.js'));
const hostingRules = require('../dist/server/modules/mahjong/tea-fee.js');

function normalizeStats(stats) {
  return {
    balances: [...stats.balanceMap.entries()].sort(([left], [right]) => left.localeCompare(right)),
    teaFeeTotal: stats.teaFeeTotal,
    totalTurnover: stats.totalTurnover,
  };
}

test('Cloud Function and Cloud Hosting use identical Mahjong money rules', () => {
  const rows = [
    { id: 'first', payerId: 'b', payeeType: 'user', payeeId: 'a', amount: '100.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'per_player', autoFeeThresholdAmount: '20.00', autoFeeRatePercent: 5 },
    { id: 'second', payerId: 'c', payeeType: 'user', payeeId: 'a', amount: '50.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'per_player', autoFeeThresholdAmount: '20.00', autoFeeRatePercent: 5 },
    { id: 'manual-tea', payerId: 'a', payeeType: 'tea_fee', payeeId: null, amount: '3.00', reversalOf: null, transactionType: 'manual', autoFeeMode: null, autoFeeThresholdAmount: null, autoFeeRatePercent: null },
    { id: 'reversal', payerId: 'a', payeeType: 'user', payeeId: 'c', amount: '50.00', reversalOf: 'second', transactionType: 'manual', autoFeeMode: null, autoFeeThresholdAmount: null, autoFeeRatePercent: null },
  ];
  const expected = {
    balances: [['a', 9200], ['b', -10000], ['c', 0]],
    teaFeeTotal: 800,
    totalTurnover: 10300,
  };

  assert.deepEqual(normalizeStats(rules.calculateRoomStats(rows)), expected);
  assert.deepEqual(normalizeStats(cloudCore.calculateRoomStats(rows)), expected);
  assert.deepEqual(normalizeStats(hostingRules.calculateRoomStats(rows)), expected);
  assert.equal(hostingRules.centsToAmount(-5), cloudCore.centsToAmount(-5));
  assert.equal(hostingRules.calculatePerPlayerTeaFeeCents(1501, 0, 5), cloudCore.calculateTeaFeeCents(1501, 0, 5));
});

test('threshold tea fee follows the full-threshold rule in every runtime', () => {
  const rows = [
    { id: 'ten', payerId: 'b', payeeType: 'user', payeeId: 'a', amount: '10.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'threshold', autoFeeThresholdAmount: '10.00', autoFeeRatePercent: null, autoFeeAmount: '1.00' },
    { id: 'nineteen', payerId: 'c', payeeType: 'user', payeeId: 'a', amount: '19.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'threshold', autoFeeThresholdAmount: '10.00', autoFeeRatePercent: null, autoFeeAmount: '1.00' },
    { id: 'twenty-nine', payerId: 'd', payeeType: 'user', payeeId: 'a', amount: '29.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'threshold', autoFeeThresholdAmount: '10.00', autoFeeRatePercent: null, autoFeeAmount: '1.00' },
  ];
  const expected = {
    balances: [['a', 5400], ['b', -1000], ['c', -1900], ['d', -2900]],
    teaFeeTotal: 400,
    totalTurnover: 5800,
  };

  assert.deepEqual(normalizeStats(rules.calculateRoomStats(rows)), expected);
  assert.deepEqual(normalizeStats(cloudCore.calculateRoomStats(rows)), expected);
  assert.deepEqual(normalizeStats(hostingRules.calculateRoomStats(rows)), expected);
});

test('room visibility policy stays identical for active and archived rooms', () => {
  assert.equal(rules.canViewRoom({ isArchived: false, isActiveMember: true, wasMember: true }), true);
  assert.equal(rules.canViewRoom({ isArchived: false, isActiveMember: false, wasMember: true }), false);
  assert.equal(rules.canViewRoom({ isArchived: true, isActiveMember: false, wasMember: true }), true);
  assert.equal(rules.canViewRoom({ isArchived: true, isActiveMember: false, wasMember: false }), false);
  assert.equal(hostingRules.canViewRoom({ isArchived: true, isActiveMember: false, wasMember: true }), true);
});
