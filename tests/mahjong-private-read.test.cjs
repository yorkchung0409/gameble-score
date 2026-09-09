const assert = require('node:assert/strict');
const test = require('node:test');

const { MahjongController } = require('../dist/server/modules/mahjong/mahjong.controller.js');

test('private Mahjong room reads bind the viewer to the authenticated OpenID', async () => {
  const calls = [];
  const mahjongService = {
    getUserIdByWeChatOpenId: async (openId) => {
      assert.equal(openId, 'openid-1');
      return 'viewer-1';
    },
    getRoomDetail: async (...args) => {
      calls.push(args);
      return { room: { roomCode: 'ROOM01' } };
    },
  };
  const controller = new MahjongController(mahjongService, {});

  await controller.getRoomDetail('room01', '30', '0', 'openid-1');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'room01');
  assert.equal(calls[0][1].limit, 30);
  assert.equal(calls[0][1].offset, 0);
  assert.equal(calls[0][2], 'viewer-1');
});

test('legacy public Mahjong room reads keep their existing compatibility path', async () => {
  const calls = [];
  const controller = new MahjongController({
    getRoomDetail: async (...args) => {
      calls.push(args);
      return { room: { roomCode: 'ROOM01' } };
    },
  }, {});

  await controller.getRoomDetail('ROOM01');

  assert.equal(calls[0][2], undefined);
});
