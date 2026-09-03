import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Users, Plus, Check, X, ArrowLeft, Copy } from 'lucide-react';
import { pokerApi, roomVisitsApi } from '@client/src/api';
import { useDeviceId } from '@client/src/hooks/useDeviceId';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import StatCards from './StatCards';
import GameCard from './GameCard';
import GameDialog from './GameDialog';
import PlayerManageDialog from './PlayerManageDialog';
import type {
  RoomDetailResponse,
  Game,
  CreateGameRequest,
} from '@shared/api.interface';

const POLL_INTERVAL = 5000;

const RoomPage = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const deviceId = useDeviceId();

  const [data, setData] = useState<RoomDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Edit room name
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>('');
  const [savingName, setSavingName] = useState<boolean>(false);

  // Dialogs
  const [gameDialogOpen, setGameDialogOpen] = useState<boolean>(false);
  const [playerDialogOpen, setPlayerDialogOpen] = useState<boolean>(false);
  const [editingGame, setEditingGame] = useState<Game | undefined>(undefined);

  const fetchRoom = useCallback(async (showError = true) => {
    if (!roomCode) return;
    try {
      const res = await pokerApi.getRoom(roomCode);
        setData(res);
        setError(null);

        if (deviceId) {
          try {
            await roomVisitsApi.recordVisit({
              deviceId,
              roomId: res.room.id,
              gameType: res.room.gameType,
              roomCode: res.room.roomCode,
              roomName: res.room.roomName,
            });
          } catch {
            // 记录失败不影响主流程
          }
        }
      } catch (err: unknown) {
      if (showError) {
        setError(err instanceof Error ? err.message : '加载房间失败');
      }
    } finally {
      setLoading(false);
    }
  }, [roomCode, deviceId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!roomCode) {
      navigate('/');
      return;
    }
    fetchRoom(true);
    const timer = setInterval(() => {
      fetchRoom(false);
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [roomCode, navigate, fetchRoom]);

  const startEditName = () => {
    if (!data) return;
    setNameInput(data.room.roomName);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameInput('');
  };

  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      toast.success(
        data?.room.gameType === 'mahjong' ? '房间号已复制' : '账本号已复制',
      );
    } catch {
      toast.error('复制失败');
    }
  };

  const saveRoomName = async () => {
    if (!roomCode || !nameInput.trim()) {
      toast.error('房间名称不能为空');
      return;
    }
    setSavingName(true);
    try {
      await pokerApi.updateRoom(roomCode, { roomName: nameInput.trim() });
      setEditingName(false);
      toast.success('房间名称已更新');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingName(false);
    }
  };

  const handleAddPlayer = async (name: string) => {
    if (!roomCode) return;
    await pokerApi.addPlayer(roomCode, { name });
    fetchRoom(true);
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!roomCode) return;
    await pokerApi.removePlayer(roomCode, playerId);
    fetchRoom(true);
  };

  const openCreateGame = () => {
    if (data && data.players.length === 0) {
      toast.error('请先添加人员再创建牌局');
      setPlayerDialogOpen(true);
      return;
    }
    setEditingGame(undefined);
    setGameDialogOpen(true);
  };

  const handleEditGame = (game: Game) => {
    setEditingGame(game);
    setGameDialogOpen(true);
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!roomCode) return;
    try {
      await pokerApi.deleteGame(roomCode, gameId);
      toast.success('已删除');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSubmitGame = async (gameData: CreateGameRequest) => {
    if (!roomCode) return;
    if (editingGame) {
      await pokerApi.updateGame(roomCode, editingGame.id, gameData);
      toast.success('牌局已更新');
    } else {
      await pokerApi.createGame(roomCode, gameData);
      toast.success('牌局已创建');
    }
    fetchRoom(true);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
          color: '#f0f0e8',
        }}
      >
        加载中...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
          color: '#f0f0e8',
        }}
      >
        <div className="text-center">
          <p className="mb-4">{error || '房间不存在'}</p>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </div>
      </div>
    );
  }

  const gameTypeLabel = data.room.gameType === 'mahjong' ? '麻将' : '德州';

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
      }}
    >
      <div className="max-w-[520px] mx-auto px-5 py-6">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              style={{
                color: '#f2f2ea',
                borderColor: 'rgba(255,255,255,0.16)',
              }}
              onClick={() =>
                navigate(
                  data.room.gameType === 'mahjong'
                    ? '/?game=mahjong'
                    : '/',
                )
              }
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="text-xl font-bold h-9 w-60"
                  style={{ color: '#f2f2ea' }}
                  autoFocus
                />
                <Button
                  size="icon"
                  className="h-9 w-9"
                  style={{ backgroundColor: '#d4af37', color: '#07301a' }}
                  onClick={saveRoomName}
                  disabled={savingName}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  style={{
                    color: '#f0f0e8',
                    borderColor: 'rgba(255,255,255,0.16)',
                  }}
                  onClick={cancelEditName}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-medium"
                  style={{ color: '#c9c9bc' }}
                >
                  {gameTypeLabel} ·
                </span>
                <h1
                  className="text-xl font-bold cursor-pointer hover:opacity-80"
                  style={{ color: '#f2f2ea' }}
                  onClick={startEditName}
                >
                  {data.room.roomName}
                </h1>
                <Pencil
                  className="w-4 h-4 cursor-pointer"
                  style={{ color: '#c9c9bc' }}
                  onClick={startEditName}
                />
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm cursor-pointer hover:opacity-70 transition-opacity ml-1"
                  style={{ color: '#f2f2ea' }}
                  onClick={handleCopyRoomCode}
                  title={
                    data.room.gameType === 'mahjong' ? '点击复制房间号' : '点击复制账本号'
                  }
                >
                  <span style={{ color: '#c9c9bc' }}>
                    {data.room.gameType === 'mahjong' ? '房间号：' : '账本号：'}
                  </span>
                  <span className="font-mono font-medium">
                    {data.room.roomCode}
                  </span>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              style={{
                color: '#f2f2ea',
                borderColor: 'rgba(255,255,255,0.16)',
              }}
              onClick={() => setPlayerDialogOpen(true)}
            >
              <Users className="w-4 h-4" />
              人员管理
            </Button>
            <Button
              style={{
                backgroundColor: '#d4af37',
                color: '#07301a',
              }}
              onClick={openCreateGame}
            >
              <Plus className="w-4 h-4" />
              添加牌局
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-6">
          <StatCards totalGames={data.stats.totalGames} />
        </div>

        {/* Game list */}
        <div>
          <h2
            className="text-lg font-semibold mb-3"
            style={{ color: '#f2f2ea' }}
          >
            牌局记录
          </h2>
          {data.games.length === 0 ? (
            <div
              className="rounded-xl p-10 text-center"
              style={{
                backgroundColor: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#c9c9bc',
              }}
            >
              还没有牌局记录，点击「添加牌局」开始记账
            </div>
          ) : (
            <div data-ai-section-type="card-list">
              {data.games.map((game: Game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onEdit={handleEditGame}
                  onDelete={handleDeleteGame}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <PlayerManageDialog
        open={playerDialogOpen}
        onOpenChange={setPlayerDialogOpen}
        players={data.players}
        onAddPlayer={handleAddPlayer}
        onDeletePlayer={handleDeletePlayer}
      />

      <GameDialog
        open={gameDialogOpen}
        onOpenChange={setGameDialogOpen}
        players={data.players}
        initialGame={editingGame}
        onSubmit={handleSubmitGame}
      />
    </div>
  );
};

export default RoomPage;
