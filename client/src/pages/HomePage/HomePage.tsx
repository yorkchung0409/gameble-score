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
      className="min-h-screen w-full flex justify-center items-start px-5 py-6"
      style={{
        background: '#F4F6F1',
      }}
    >
      <div className="w-full max-w-[520px]">
        <div
          className="text-center mb-6"
          style={{
            background: 'linear-gradient(135deg, #EAF4ED, #DCEEE3)',
            borderRadius: 16,
            padding: '22px 16px 18px',
          }}
        >
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: '#B08D1E' }}
          >
            牌局记账
          </h1>
          <p style={{ color: '#6B7A70' }}>
            多人云端协作，实时同步牌局数据
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: '#6B7A70' }}
          >
            你是：{currentUser.name}
          </p>
        </div>

        <Tabs
          value={gameType}
          onValueChange={handleGameChange}
          className="mb-5"
        >
          <TabsList className="w-full bg-[#E8ECE6]">
            <TabsTrigger
              value={GAME_TEXAS}
              className="flex-1 text-base font-medium"
              style={{ color: '#222B26' }}
            >
              德州
            </TabsTrigger>
            <TabsTrigger
              value={GAME_MAHJONG}
              className="flex-1 text-base font-medium"
              style={{ color: '#222B26' }}
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
