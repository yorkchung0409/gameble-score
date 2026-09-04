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
import UsageGuideDialog from '@client/src/components/UsageGuideDialog';

const GAME_TEXAS = 'texas';
const GAME_MAHJONG = 'mahjong';

const AVATAR_COLORS = [
  '#e8a13c',
  '#7fb3e0',
  '#e0706f',
  '#6fbf8b',
  '#9d8ad6',
  '#4db6ac',
  '#e57fb0',
  '#f28d4f',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarColor(userId: string): string {
  return AVATAR_COLORS[hashCode(userId) % AVATAR_COLORS.length];
}

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { deviceId, currentUser, setCurrentUser } = useMahjongUser();
  const [guideOpen, setGuideOpen] = useState(false);

  const gameParam = searchParams.get('game') || GAME_MAHJONG;
  const [gameType, setGameType] = useState<string>(
    gameParam === GAME_TEXAS ? GAME_TEXAS : GAME_MAHJONG,
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
    setSearchParams({ game: value });
  };

  return (
    <div
      className="min-h-screen w-full flex justify-center items-start px-5 py-6"
      style={{
        background: '#F4F6F1',
      }}
    >
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-3 mb-6 px-1" style={{ minHeight: 44 }}>
          {currentUser ? (
            <>
              <span
                className="h-10 w-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                style={{ backgroundColor: avatarColor(currentUser.id), color: '#ffffff' }}
                aria-hidden="true"
              >
                {currentUser.name.trim().charAt(0) || '?'}
              </span>
              <span className="text-lg font-semibold" style={{ color: '#222B26' }}>
                {currentUser.name}
              </span>
            </>
          ) : (
            <span className="text-lg font-semibold" style={{ color: '#222B26' }}>
              牌局记账
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            aria-label="使用说明"
            onClick={() => setGuideOpen(true)}
            className="h-9 w-9 rounded-full flex items-center justify-center text-base font-bold shrink-0"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E6EAE2',
              color: '#B08D1E',
            }}
          >
            ?
          </button>
        </div>

        {!currentUser && (
          <UserCreationOverlay
            deviceId={deviceId}
            onCreated={setCurrentUser}
            createUser={mahjongApi.createUser}
          />
        )}

        <Tabs
          value={gameType}
          onValueChange={handleGameChange}
          className="mb-5"
        >
          <TabsList className="w-full bg-[#E8ECE6]">
            <TabsTrigger
              value={GAME_MAHJONG}
              className="flex-1 text-base font-medium"
              style={{ color: '#222B26' }}
            >
              麻将
            </TabsTrigger>
            <TabsTrigger
              value={GAME_TEXAS}
              className="flex-1 text-base font-medium"
              style={{ color: '#222B26' }}
            >
              扑克
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
        <UsageGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
};

export default HomePage;
