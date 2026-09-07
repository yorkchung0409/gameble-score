const assert = require('node:assert/strict');
const test = require('node:test');

const { OperationsService } = require('../dist/server/modules/operations/operations.service.js');

test('operations access is restricted to the configured WeChat OpenID allowlist', () => {
  const previous = process.env.ADMIN_WECHAT_OPENIDS;
  process.env.ADMIN_WECHAT_OPENIDS = 'admin-one, admin-two , ,';
  try {
    const service = new OperationsService({}, {});
    assert.equal(service.isAdminOpenId('admin-one'), true);
    assert.equal(service.isAdminOpenId(' admin-two '), true);
    assert.equal(service.isAdminOpenId('someone-else'), false);
    assert.equal(service.isAdminOpenId(), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_WECHAT_OPENIDS;
    else process.env.ADMIN_WECHAT_OPENIDS = previous;
  }
});
