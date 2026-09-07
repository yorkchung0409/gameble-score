const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const { LOCAL_HOST, loadConfig, validateDatabaseConfig } = require('../tools/operations-dashboard/config.js');

test('local operations dashboard is bound to loopback and requires database credentials', () => {
  assert.equal(LOCAL_HOST, '127.0.0.1');
  const config = loadConfig({ OPERATIONS_PORT: '4177' });
  assert.equal(config.host, '127.0.0.1');
  assert.throws(() => validateDatabaseConfig(config), /Missing local operations database configuration/);
});

test('local operations dashboard contains only read queries and keeps cloud credentials out of source', () => {
  const source = fs.readFileSync(path.join(root, 'tools', 'operations-dashboard', 'server.js'), 'utf8');
  const configSource = fs.readFileSync(path.join(root, 'tools', 'operations-dashboard', 'config.js'), 'utf8');
  assert.match(source, /SELECT COUNT\(DISTINCT user_id\)/);
  assert.match(configSource, /LOCAL_HOST = '127\.0\.0\.1'/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  assert.doesNotMatch(source, /TENCENTCLOUD_SECRET/);
});
