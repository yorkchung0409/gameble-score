import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Copy } from 'lucide-react';
import { mahjongApi, roomVisitsApi } from '@client/src/api';
import { useMahjongUser } from '@client/src/hooks/useMahjongUser';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import SeatSection from './SeatSection';
import MemberSection from './MemberSection';
import ScoreBoard from './ScoreBoard';
import TransactionDialog, { PayeeOption } from './TransactionDialog';
import type { TransactionDialogHandle } from './TransactionDialog';
import TransactionList from './TransactionList';
import type {
  MahjongRoomDetailResponse,
  MahjongSeat,
  MahjongTransaction,
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
  const [modeDialogOpen, setModeDialogOpen] = useState<boolean>(false);
  const [switchingMode, setSwitchingMode] = useState<boolean>(false);
  const txDialogRef = useRef<TransactionDialogHandle>(null);

  const fetchRoom = useCallback(
    async (showError = true) => {
      if (!roomCode) return;
      try {
        let detail: MahjongRoomDetailResponse;
        if (currentUser) {
          // 进入房间自动登记为成员（幂等）
          try {
            detail = await mahjongApi.joinRoom(roomCode, {
              userId: currentUser.id,
            });
          } catch {
            detail = await mahjongApi.getRoom(roomCode);
          }
        } else {
          detail = await mahjongApi.getRoom(roomCode);
        }
        setData(detail);
        setError(null);

        if (currentUser && deviceId) {
          try {
            await roomVisitsApi.recordVisit({
              deviceId,
              userId: currentUser.id,
              roomId: detail.room.id,
              gameType: 'mahjong',
              roomCode: detail.room.roomCode,
              roomName: detail.room.name,
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

  const handleSwitchMode = async (mode: 'seated' | 'free') => {
    if (!roomCode || !currentUser || !data) return;
    // 坐下模式 -> 普通模式：需所有玩家离座（前端预校验，后端同样校验）
    if (mode === 'free' && data.seats.length > 0) {
      toast.error('有玩家正在座位上，需全部离座后才能切换为普通模式');
      return;
    }
    setSwitchingMode(true);
    try {
      await mahjongApi.updateRoomMode(roomCode, {
        mode,
        operatorUserId: currentUser.id,
      });
      toast.success(mode === 'free' ? '已切换为普通模式' : '已切换为坐下模式');
      setModeDialogOpen(false);
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleReverseTransaction = async (tx: MahjongTransaction) => {
    if (!roomCode || !currentUser) return;

    const payeeLabel = tx.payeeType === 'tea_fee' ? '茶水费' : tx.payeeName ?? '';
    const ok = window.confirm(
      `确定冲正这笔转账吗？\n\n${tx.payerName} → ${payeeLabel}  ¥${Number(tx.amount).toFixed(2)}\n\n冲正会新增一笔反向记录，原记录保留，账目自动还原。`,
    );
    if (!ok) return;

    try {
      await mahjongApi.reverseTransaction(roomCode, tx.id, {
        operatorUserId: currentUser.id,
      });
      toast.success('已冲正该笔转账');
      fetchRoom(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '冲正失败');
    }
  };

  const handleQuickTransfer = (payeeId: string) => {
    txDialogRef.current?.open(payeeId);
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
  const isFreeMode = data.room.mode === 'free';
  const isOwner = !!data.room.creatorUserId && data.room.creatorUserId === currentUserId;
  const mySeat = data.seats.find(
    (s: MahjongSeat) => s.userId === currentUserId,
  );
  const currentUserSeated = !!mySeat;
  const balanceCheckPassed = data.stats.balanceCheck === 'balanced';

  const payeeOptions: PayeeOption[] = isFreeMode
    ? data.members
        .filter((m) => m.userId !== currentUserId)
        .map((m) => ({ id: m.userId, name: m.userName }))
    : data.seats
        .filter((s) => s.userId !== currentUserId)
        .map((s) => ({ id: s.userId, name: s.userName }));

  // 坐下模式：未入座时手动转账按钮给出提示
  const blockedMessage = !isFreeMode && !currentUserSeated
    ? '坐下后才能转账，请先选择座位入座'
    : undefined;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
      }}
    >
      <div className="max-w-[520px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              style={{
                color: '#f2f2ea',
                borderColor: 'rgba(255,255,255,0.16)',
              }}
              onClick={() => navigate('/?game=mahjong')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-medium"
                  style={{ color: '#c9c9bc' }}
                >
                  麻将 ·
                </span>
                <h1
                  className="text-xl font-bold"
                  style={{ color: '#f2f2ea' }}
                >
                  {data.room.name}
                </h1>
              </div>
              <div
                className="flex items-center gap-1 mt-0.5 cursor-pointer select-none transition-opacity hover:opacity-70"
                onClick={handleCopyRoomCode}
                title="点击复制房间号"
              >
                <span className="text-xs" style={{ color: '#c9c9bc' }}>
                  房间号：
                </span>
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: '#f2f2ea' }}
                >
                  {data.room.roomCode}
                </span>
                <Copy
                  className="w-3 h-3"
                  style={{ color: '#f2f2ea' }}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(212,175,55,0.15)',
                    color: '#e8c96a',
                  }}
                >
                  {isFreeMode ? '普通模式' : '坐下模式'}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    className="text-[10px] underline transition-opacity hover:opacity-70"
                    style={{ color: '#c9c9bc' }}
                    onClick={() => setModeDialogOpen(true)}
                  >
                    切换模式
                  </button>
                )}
              </div>
              <p className="text-sm mt-0.5" style={{ color: '#c9c9bc' }}>
                你是：{currentUser?.name ?? '未设置昵称'}
              </p>
            </div>
          </div>
        </div>

        {isFreeMode ? (
          <MemberSection
            members={data.members}
            balances={data.stats.balances}
            teaFeeTotal={data.stats.teaFeeTotal}
            currentUserId={currentUserId}
            onQuickTransfer={handleQuickTransfer}
          />
        ) : (
          <SeatSection
            seats={data.seats}
            currentUserId={currentUserId}
            onSitDown={handleSitDown}
            onLeaveSeat={handleLeaveSeat}
            onQuickTransfer={handleQuickTransfer}
            canInteract={!!currentUser && !mySeat}
            currentUserSeated={currentUserSeated}
          />
        )}

        <ScoreBoard
          totalTurnover={data.stats.totalTurnover}
          balanceCheckPassed={balanceCheckPassed}
        />

        <TransactionDialog
          ref={txDialogRef}
          payeeOptions={payeeOptions}
          currentUserId={currentUserId}
          currentUserName={currentUser?.name ?? ''}
          blockedMessage={blockedMessage}
          onSubmit={handleSubmitTransaction}
          submitting={submitting}
        />

        <TransactionList
          transactions={data.transactions}
          currentUserId={currentUserId}
          onReverse={handleReverseTransaction}
        />

        <Dialog open={modeDialogOpen} onOpenChange={setModeDialogOpen}>
          <DialogContent
            style={{
              backgroundColor: '#0a3d22',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#f0f0e8',
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: '#f2f2ea' }}>房间模式</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                disabled={switchingMode}
                onClick={() => handleSwitchMode('free')}
                style={{
                  color: '#f0f0e8',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <div className="flex flex-col items-start">
                  <span className="font-semibold">普通模式</span>
                  <span className="text-xs" style={{ color: '#c9c9bc' }}>
                    进入房间即可转账（需全部离座才能从坐下模式切回）
                  </span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                disabled={switchingMode}
                onClick={() => handleSwitchMode('seated')}
                style={{
                  color: '#f0f0e8',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <div className="flex flex-col items-start">
                  <span className="font-semibold">坐下模式</span>
                  <span className="text-xs" style={{ color: '#c9c9bc' }}>
                    必须坐下才能转账，打牌的人自己选位置
                  </span>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setModeDialogOpen(false)}
                style={{
                  color: '#f0f0e8',
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default MahjongRoomPage;
