import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Copy } from 'lucide-react';
import { mahjongApi, roomVisitsApi } from '@client/src/api';
import { useMahjongUser } from '@client/src/hooks/useMahjongUser';
import { Button } from '@client/src/components/ui/button';
import SeatSection from './SeatSection';
import ScoreBoard from './ScoreBoard';
import TransactionDialog from './TransactionDialog';
import type { TransactionDialogHandle } from './TransactionDialog';
import TransactionList from './TransactionList';
import type {
  MahjongRoomDetailResponse,
  MahjongSeat,
  CreateTransactionRequest,
} from '@shared/api.interface';

const POLL_INTERVAL = 5000;

const MahjongRoomPage = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { currentUser, deviceId } = useMahjongUser();

  const [data, setData] = useState<MahjongRoomDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const txDialogRef = useRef<TransactionDialogHandle>(null);

  const fetchRoom = useCallback(
    async (showError = true) => {
      if (!roomCode) return;
      try {
        const res = await mahjongApi.getRoom(roomCode);
        setData(res);
        setError(null);

        if (currentUser && deviceId) {
          try {
            await roomVisitsApi.recordVisit({
              deviceId,
              userId: currentUser.id,
              roomId: res.room.id,
              gameType: 'mahjong',
              roomCode: res.room.roomCode,
              roomName: res.room.name,
            });
          } catch {
            // 记录失败不影响主流程
          }
        }
      } catch (err: unknown) {
        if (showError) {
          setError(err instanceof Error ? err.message : '加载房间失败');
          toast.error(err instanceof Error ? err.message : '加载房间失败');
        }
      } finally {
        setLoading(false);
      }
    },
    [roomCode, currentUser],
  );

  useEffect(() => {
    if (!roomCode) {
      navigate('/?game=mahjong');
      return;
    }
    fetchRoom(true);
    const timer = setInterval(() => {
      fetchRoom(false);
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [roomCode, navigate, fetchRoom]);

  const handleSitDown = async (seatIndex: number) => {
    if (!roomCode || !currentUser) {
      toast.error('请先设置昵称');
      return;
    }
    try {
      await mahjongApi.sitDown(roomCode, {
        userId: currentUser.id,
        seatIndex,
      });
      toast.success('已就座');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '坐下失败');
    }
  };

  const handleLeaveSeat = async () => {
    if (!roomCode || !currentUser) return;
    try {
      await mahjongApi.leaveSeat(roomCode, {
        userId: currentUser.id,
      });
      toast.success('已离开座位');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '离开失败');
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!roomCode) return;
    try {
      await mahjongApi.deleteTransaction(roomCode, transactionId);
      toast.success('已删除转账记录');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleQuickTransfer = (payeeUserId: string) => {
    txDialogRef.current?.open(payeeUserId);
  };

  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      toast.success('已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleSubmitTransaction = async (
    payload: CreateTransactionRequest,
  ) => {
    if (!roomCode) return;
    setSubmitting(true);
    try {
      await mahjongApi.createTransaction(roomCode, payload);
      toast.success('转账记录已添加');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
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
          <Button onClick={() => navigate('/?game=mahjong')}>返回首页</Button>
        </div>
      </div>
    );
  }

  const currentUserId = currentUser?.id ?? '';
  const mySeat = data.seats.find(
    (s: MahjongSeat) => s.userId === currentUserId,
  );
  const balanceCheckPassed = data.stats.balanceCheck === 'balanced';
  const currentUserSeated = !!mySeat;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
      }}
    >
      <div className="max-w-[960px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              style={{
                color: '#e8c96a',
                borderColor: 'rgba(212,175,55,0.3)',
              }}
              onClick={() => navigate('/?game=mahjong')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-medium"
                  style={{ color: '#b8b8a8' }}
                >
                  麻将 ·
                </span>
                <h1
                  className="text-xl font-bold"
                  style={{ color: '#e8c96a' }}
                >
                  {data.room.name}
                </h1>
              </div>
              <div
                className="flex items-center gap-1 mt-0.5 cursor-pointer select-none transition-opacity hover:opacity-70"
                onClick={handleCopyRoomCode}
                title="点击复制房间号"
              >
                <span className="text-xs" style={{ color: '#b8b8a8' }}>
                  房间号：
                </span>
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: '#e8c96a' }}
                >
                  {data.room.roomCode}
                </span>
                <Copy
                  className="w-3 h-3"
                  style={{ color: '#e8c96a' }}
                />
              </div>
              <p className="text-sm mt-0.5" style={{ color: '#b8b8a8' }}>
                你是：{currentUser?.name ?? '未设置昵称'}
              </p>
            </div>
          </div>
        </div>

        <SeatSection
          seats={data.seats}
          currentUserId={currentUserId}
          onSitDown={handleSitDown}
          onLeaveSeat={handleLeaveSeat}
          onQuickTransfer={handleQuickTransfer}
          canInteract={!!currentUser && !mySeat}
          currentUserSeated={currentUserSeated}
        />

        <ScoreBoard
          balances={data.stats.balances}
          teaFeeTotal={data.stats.teaFeeTotal}
          totalTurnover={data.stats.totalTurnover}
          balanceCheckPassed={balanceCheckPassed}
        />

        <TransactionDialog
          ref={txDialogRef}
          seats={data.seats}
          currentUserId={currentUserId}
          onSubmit={handleSubmitTransaction}
          submitting={submitting}
        />

        <TransactionList
          transactions={data.transactions}
          onDelete={handleDeleteTransaction}
        />
      </div>
    </div>
  );
};

export default MahjongRoomPage;
