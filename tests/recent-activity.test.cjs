const assert = require('node:assert/strict');
const test = require('node:test');

const { ProfileController } = require('../dist/server/modules/profile/profile.controller.js');

test('recent Mahjong room keeps a room after the user has left it', async () => {
  const calls = [];
  const profileService = {
    getPokerLedgers: async (...args) => {
      calls.push(['poker', args]);
      return { ledgers: [] };
    },
    getMahjongRooms: async (...args) => {
      calls.push(['mahjong', args]);
      return { rooms: [] };
    },
  };
  const mahjongService = {
    getUserIdByWeChatOpenId: async () => 'user-1',
  };
  const operationsService = {
    isAdminOpenId: () => false,
  };
  const controller = new ProfileController(profileService, mahjongService, operationsService);

  await controller.getRecentActivity('openid-1');

  assert.deepEqual(calls.find(([type]) => type === 'mahjong')[1], ['user-1', 1, 0]);
});
