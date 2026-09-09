const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functionRoot = path.resolve(__dirname, '..', 'cloud-functions', 'gameble-bootstrap-probe');
const sharedRulesPath = path.resolve(__dirname, '..', 'shared', 'mahjong-rules.js');
const core = require(path.join(functionRoot, 'mahjong-core.js'));

test('cloud function core trusts OpenID and keeps all Mahjong writes behind its action dispatcher', () => {
  const source = fs.readFileSync(path.join(functionRoot, 'index.js'), 'utf8');
  const core = fs.readFileSync(path.join(functionRoot, 'mahjong-core.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(functionRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.main, 'index.js');
  assert.match(source, /cloud\.getWXContext\(\)/);
  assert.match(source, /dispatchMahjongAction/);
  assert.match(source, /dispatchPokerAction/);
  assert.match(source, /dispatchProfileAction/);
  assert.doesNotMatch(source, /mahjong_room_updates/);
  assert.match(source, /coreVersion: 2/);
  assert.match(core, /FROM user_identities/);
  assert.match(core, /FROM mahjong_room_members/);
  assert.match(core, /FROM poker_ledger_owners/);
  assert.match(core, /INSERT INTO mahjong_transactions/);
  assert.match(core, /updateMahjongUserProfile/);
  assert.match(core, /UPDATE users SET name = \? WHERE id = \?/);
  assert.match(core, /assertRoomViewer\(connection, room, user\.id\)/);
  assert.match(core, /WHERE room_id = \? AND user_id = \? LIMIT 1/);
  assert.match(core, /require\('\.\/mahjong-rules'\)/);
  assert.match(core, /'UNSUPPORTED_ACTION'/);
  assert.match(core, /beginTransaction/);
  assert.match(core, /bumpRevision/);
  assert.match(core, /getMahjongRoomRevision/);
  assert.match(core, /openId/);
  assert.match(source, /serverElapsedMs/);
  assert.match(source, /connectTimeout:\s*2000/);
});

test('cloud function documents a dedicated least-privilege database account', () => {
  const readme = fs.readFileSync(path.join(functionRoot, 'README.md'), 'utf8');
  assert.match(readme, /DB_USER=gameble_core/);
  assert.match(readme, /最小权限/);
  assert.doesNotMatch(readme, /DB_PASSWORD=[^<\n]/);
});

test('cloud function tea-fee math and amount normalization match the Mahjong ledger contract', () => {
  assert.equal(core.amountToCents('12.34'), 1234);
  assert.equal(core.amountToCents('-12.34'), -1234);
  assert.equal(core.centsToAmount(1234), '12.34');
  assert.equal(core.centsToAmount(-5), '-0.05');
  assert.equal(core.calculateTeaFeeCents(1500, 2000, 10), 0);
  assert.equal(core.calculateTeaFeeCents(1500, 1000, 10), 150);
  assert.equal(core.calculateTeaFeeCents(15, 0, 10), 1);
  assert.equal(core.calculateThresholdTeaFeeCents(1000, 1000, 100), 100);
  assert.equal(core.calculateThresholdTeaFeeCents(1900, 1000, 100), 100);
  assert.equal(core.calculateThresholdTeaFeeCents(2900, 1000, 100), 200);
  assert.throws(() => core.amountToCents('1.999'), /金额格式无效/);
});

test('cloud function calculates room stats once and can safely restore cached balances', () => {
  const stats = core.calculateRoomStats([
    { id: 'paid', payerId: 'payer', payeeType: 'user', payeeId: 'winner', amount: '100.00', reversalOf: null, transactionType: 'manual', autoFeeMode: 'per_player', autoFeeThresholdAmount: '0.00', autoFeeRatePercent: 10 },
    { id: 'tea', payerId: 'winner', payeeType: 'tea_fee', payeeId: null, amount: '10.00', reversalOf: null, transactionType: 'manual', autoFeeMode: null, autoFeeThresholdAmount: null, autoFeeRatePercent: null },
    { id: 'reversal', payerId: 'winner', payeeType: 'user', payeeId: 'payer', amount: '100.00', reversalOf: 'paid', transactionType: 'manual', autoFeeMode: null, autoFeeThresholdAmount: null, autoFeeRatePercent: null },
  ]);
  assert.equal(stats.totalTurnover, 1000);
  assert.equal(stats.teaFeeTotal, 1000);
  assert.deepEqual([...stats.balanceMap.entries()], [['payer', 0], ['winner', -1000]]);
  assert.deepEqual([...core.parseCachedBalances(JSON.stringify([...stats.balanceMap.entries()])).entries()], [['payer', 0], ['winner', -1000]]);
  assert.equal(core.parseCachedBalances('{invalid'), null);
});

test('cloud function room stats are revision-keyed and avoid a full scan on unchanged polling', () => {
  const source = fs.readFileSync(path.join(functionRoot, 'mahjong-core.js'), 'utf8');
  assert.match(source, /stats_version AS statsVersion/);
  assert.match(source, /WHERE room_code = \? AND version = \?/);
  assert.match(source, /FROM mahjong_transactions WHERE room_id = \?/);
});

test('an unchanged room revision reads only the cached aggregate', async () => {
  const statements = [];
  const connection = {
    async execute(statement) {
      statements.push(statement);
      return [[{
        version: 7,
        statsVersion: 7,
        statsTotalTurnover: '123.45',
        statsTeaFeeTotal: '6.78',
        statsBalancesJson: '[["payer",-678],["winner",678]]',
      }]];
    },
  };
  const stats = await core.getRoomStats(connection, { id: 'room-id', roomCode: 'ROOM01' });
  assert.equal(statements.length, 1);
  assert.equal(stats.totalTurnover, 12345);
  assert.equal(stats.teaFeeTotal, 678);
  assert.deepEqual([...stats.balanceMap.entries()], [['payer', -678], ['winner', 678]]);
});

test('Mini Program deployment copy stays identical to the cloud function source', () => {
  const miniFunctionRoot = path.resolve(__dirname, '..', '..', 'gameble-score-miniprogram', 'cloudfunctions', 'gameble-bootstrap-probe');
  for (const filename of ['index.js', 'mahjong-core.js', 'mahjong-rules.js', 'poker-core.js', 'profile-core.js', 'package.json']) {
    assert.equal(
      fs.readFileSync(path.join(miniFunctionRoot, filename), 'utf8'),
      fs.readFileSync(path.join(functionRoot, filename), 'utf8'),
      `${filename} must be synchronized before upload`,
    );
  }
});

test('the cloud function deploys the canonical Mahjong rules without a local fork', () => {
  assert.equal(
    fs.readFileSync(path.join(functionRoot, 'mahjong-rules.js'), 'utf8'),
    fs.readFileSync(sharedRulesPath, 'utf8'),
  );
});
