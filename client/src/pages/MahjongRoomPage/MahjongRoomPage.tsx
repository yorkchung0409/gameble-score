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

const SAFETY_SYNC_INTERVAL = 60_000;

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
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const joinedRef = useRef(false);
  const visitRecordedRef = useRef(false);

  const fetchRoom = useCallback(
    (showError = true) => {
      if (!roomCode) return Promise.resolve();
      if (fetchPromiseRef.current) return fetchPromiseRef.current;
      const run = async () => {
        try {
        let detail: MahjongRoomDetailResponse;
        if (currentUser && !joinedRef.current) {
          // 进入房间自动登记为成员（幂等）
          try {
            detail = await mahjongApi.joinRoom(roomCode, {
              userId: currentUser.id,
            });
            joinedRef.current = true;
          } catch {
            detail = await mahjongApi.getRoom(roomCode);
          }
        } else {
          detail = await mahjongApi.getRoom(roomCode);
        }
        setData(detail);

        // 房间已解散：提示并回到首页
        if (detail.room.dissolvedAt) {
          toast.info('房间已解散，已返回首页');
          navigate('/?game=mahjong');
          return;
        }

        setError(null);

        if (currentUser && deviceId && !visitRecordedRef.current) {
          try {
            await roomVisitsApi.recordVisit({
              deviceId,
              userId: currentUser.id,
              roomId: detail.room.id,
              gameType: 'mahjong',
              roomCode: detail.room.roomCode,
              roomName: detail.room.name,
            });
            visitRecordedRef.current = true;
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
      };
      fetchPromiseRef.current = run().finally(() => {
        fetchPromiseRef.current = null;
      });
      return fetchPromiseRef.current;
    },
    [roomCode, currentUser, deviceId, navigate],
  );

  useEffect(() => {
    joinedRef.current = false;
    visitRecordedRef.current = false;
  }, [roomCode, currentUser?.id]);

  useEffect(() => {
    if (!roomCode) {
      navigate('/?game=mahjong');
      return;
    }
    fetchRoom(true);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchRoom(false);
    }, SAFETY_SYNC_INTERVAL);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchRoom(false);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [roomCode, navigate, fetchRoom]);

  useEffect(() => {
    if (!roomCode) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/mahjong?roomCode=${encodeURIComponent(roomCode)}`);
      socket.onmessage = () => fetchRoom(false);
      socket.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 5000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [roomCode, fetchRoom]);

  const handleSitDown = async (seatIndex: number) => {
    if (!roomCode || !currentUser) {
      toast.error('请先设置昵称');
      return;
    }
    try {
      const detail = await mahjongApi.sitDown(roomCode, {
        userId: currentUser.id,
        seatIndex,
      });
      setData(detail);
      toast.success('已就座');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '坐下失败');
    }
  };

  const handleLeaveSeat = async () => {
    if (!roomCode || !currentUser) return;
    try {
      const detail = await mahjongApi.leaveSeat(roomCode, {
        userId: currentUser.id,
      });
      setData(detail);
      toast.success('已离开座位');
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
      const detail = await mahjongApi.updateRoomMode(roomCode, {
        mode,
        operatorUserId: currentUser.id,
      });
      setData(detail);
      toast.success(mode === 'free' ? '已切换为普通模式' : '已切换为坐下模式');
      setModeDialogOpen(false);
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
      const detail = await mahjongApi.reverseTransaction(roomCode, tx.id, {
        operatorUserId: currentUser.id,
      });
      setData(detail);
      toast.success('已冲正该笔转账');
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

  const handleExitRoom = async () => {
    if (!roomCode || !currentUser) return;
    if (!window.confirm(`确定退出「${roomCode}」房间？可随时再次进入。`)) {
      return;
    }
    try {
      await mahjongApi.leaveRoom(roomCode, { userId: currentUser.id });
      toast.success('已退出房间');
      navigate('/?game=mahjong');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '退出失败');
    }
  };

  const handleSubmitTransaction = async (
    payload: CreateTransactionRequest,
  ) => {
    if (!roomCode) return;
    setSubmitting(true);
    try {
      const detail = await mahjongApi.createTransaction(roomCode, {
        ...payload,
        operationId: payload.operationId || crypto.randomUUID(),
      });
      setData(detail);
      toast.success('转账记录已添加');
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
          background: '#F4F6F1',
          color: '#222B26',
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
          background: '#F4F6F1',
          color: '#222B26',
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
        background: '#F4F6F1',
      }}
    >
      <div className="max-w-[520px] mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              style={{
                color: '#222B26',
                borderColor: '#E6EAE2',
              }}
              onClick={() => navigate('/?game=mahjong')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(176,141,30,0.12)',
                    color: '#B08D1E',
                  }}
                >
                  {isFreeMode ? '普通模式' : '坐下模式'}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    className="text-[10px] underline transition-opacity hover:opacity-70"
                    style={{ color: '#6B7A70' }}
                    onClick={() => setModeDialogOpen(true)}
                  >
                    切换模式
                  </button>
                )}
              </div>
              <div
                className="flex items-center gap-1 mt-1 cursor-pointer select-none transition-opacity hover:opacity-70"
                onClick={handleCopyRoomCode}
                title="点击复制房间号"
              >
                <span className="text-xs" style={{ color: '#6B7A70' }}>
                  房间号：
                </span>
                <span
                  className="text-xs font-mono font-medium"
                  style={{ color: '#222B26' }}
                >
                  {data.room.roomCode}
                </span>
                <Copy
                  className="w-3 h-3"
                  style={{ color: '#222B26' }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-xs shrink-0 transition-opacity hover:opacity-70"
            style={{ color: '#6B7A70' }}
            onClick={handleExitRoom}
          >
            退出房间
          </button>
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
            balances={data.stats.balances}
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
          avatarTransferHint={isFreeMode}
        />

        <Dialog open={modeDialogOpen} onOpenChange={setModeDialogOpen}>
          <DialogContent
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E6EAE2',
              color: '#222B26',
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: '#222B26' }}>房间模式</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                disabled={switchingMode}
                onClick={() => handleSwitchMode('free')}
                style={{
                  color: '#222B26',
                  borderColor: '#DCE3DC',
                }}
              >
                <div className="flex flex-col items-start">
                  <span className="font-semibold">普通模式</span>
                  <span className="text-xs" style={{ color: '#6B7A70' }}>
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
                  color: '#222B26',
                  borderColor: '#DCE3DC',
                }}
              >
                <div className="flex flex-col items-start">
                  <span className="font-semibold">坐下模式</span>
                  <span className="text-xs" style={{ color: '#6B7A70' }}>
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
                  color: '#222B26',
                  borderColor: '#DCE3DC',
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
