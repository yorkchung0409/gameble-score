import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import { mahjongApi } from '@client/src/api';
import { useMahjongUser } from '@client/src/hooks/useMahjongUser';
import UserCreationOverlay from './UserCreationOverlay';
import TexasPanel from './TexasPanel';
import MahjongPanel from './MahjongPanel';

const GAME_TEXAS = 'texas';
const GAME_MAHJONG = 'mahjong';

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { deviceId, currentUser, setCurrentUser } = useMahjongUser();

  const gameParam = searchParams.get('game') || GAME_TEXAS;
  const [gameType, setGameType] = useState<string>(
    gameParam === GAME_MAHJONG ? GAME_MAHJONG : GAME_TEXAS,
  );

  useEffect(() => {
    if (!deviceId || currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await mahjongApi.getUserByDevice(deviceId);
        if (res.user && !cancelled) {
          setCurrentUser({ id: res.user.id, name: res.user.name });
        }
      } catch {
        // 忽略查询失败，走创建流程
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, currentUser, setCurrentUser]);

  const handleGameChange = (value: string) => {
    setGameType(value);
    setSearchParams(value === GAME_TEXAS ? {} : { game: value });
  };

  if (!currentUser) {
    return (
      <UserCreationOverlay
        deviceId={deviceId}
        onCreated={setCurrentUser}
        createUser={mahjongApi.createUser}
      />
    );
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5 py-6"
      style={{
        background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
      }}
    >
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-6">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: '#e8c96a' }}
          >
            牌局记账
          </h1>
          <p style={{ color: '#c9c9bc' }}>
            多人云端协作，实时同步牌局数据
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: '#e8c96a' }}
          >
            你是：{currentUser.name}
          </p>
        </div>

        <Tabs
          value={gameType}
          onValueChange={handleGameChange}
          className="mb-5"
        >
          <TabsList className="w-full bg-black/20">
            <TabsTrigger
              value={GAME_TEXAS}
              className="flex-1 text-base font-medium"
              style={{ color: '#f0f0e8' }}
            >
              德州
            </TabsTrigger>
            <TabsTrigger
              value={GAME_MAHJONG}
              className="flex-1 text-base font-medium"
              style={{ color: '#f0f0e8' }}
            >
              麻将
            </TabsTrigger>
            </TabsList>

            <TabsContent value={GAME_TEXAS} style={{ margin: 0 }}>
              <TexasPanel gameType={gameType} />
            </TabsContent>

            <TabsContent value={GAME_MAHJONG} style={{ margin: 0 }}>
              <MahjongPanel />
            </TabsContent>
          </Tabs>
        </div>
    </div>
  );
};

export default HomePage;
