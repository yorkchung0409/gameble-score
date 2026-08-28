import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import { pokerApi } from '@client/src/api';
import { useDeviceId } from '@client/src/hooks/useDeviceId';
import RecentRooms from '@client/src/components/RecentRooms';
import { useNavigate } from 'react-router-dom';

interface TexasPanelProps {
  gameType: string;
}

const TexasPanel = ({ gameType }: TexasPanelProps) => {
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const [activeTab, setActiveTab] = useState<string>('create');

  const [roomName, setRoomName] = useState<string>('牌局记账');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  const [joinCode, setJoinCode] = useState<string>('');
  const [joining, setJoining] = useState<boolean>(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      toast.error('请输入房间名称');
      return;
    }
    setCreating(true);
    try {
      const res = await pokerApi.createRoom({
        roomName: roomName.trim(),
        roomCode: roomCodeInput.trim() || undefined,
        gameType,
      });
      toast.success('房间创建成功');
      navigate(`/room/${res.room.roomCode}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : '创建房间失败，请重试',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      toast.error('请输入房间码');
      return;
    }
    setJoining(true);
    try {
      const res = await pokerApi.getRoom(joinCode.trim());
      if (res.room.gameType !== gameType) {
        toast.error('该房间不属于当前游戏类型');
        setJoining(false);
        return;
      }
      toast.success('加入成功');
      navigate(`/room/${joinCode.trim()}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : '房间不存在，请检查房间码',
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <RecentRooms deviceId={deviceId} gameType="texas" pathPrefix="/room/" />
    <div
      className="rounded-xl p-6 shadow-lg"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(212,175,55,0.3)',
        boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
      }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-6 bg-black/20">
          <TabsTrigger value="create" className="flex-1 text-[#f0f0e8]">
            创建房间
          </TabsTrigger>
          <TabsTrigger value="join" className="flex-1 text-[#f0f0e8]">
            加入房间
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#b8b8a8' }}
              >
                房间名称
              </label>
              <Input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="请输入房间名称"
                style={{ color: '#f0f0e8' }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#b8b8a8' }}
              >
                房间码（选填，留空自动生成）
              </label>
              <Input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="自定义房间码"
                style={{ color: '#f0f0e8' }}
              />
            </div>
            <Button
              type="submit"
              disabled={creating}
              className="w-full font-semibold mt-2"
              style={{
                backgroundColor: '#d4af37',
                color: '#07301a',
              }}
            >
              {creating ? '创建中...' : '创建房间'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="join">
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#b8b8a8' }}
              >
                房间码
              </label>
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="请输入房间码"
                style={{ color: '#f0f0e8' }}
              />
            </div>
            <Button
              type="submit"
              disabled={joining}
              className="w-full font-semibold mt-2"
              style={{
                backgroundColor: '#d4af37',
                color: '#07301a',
              }}
            >
              {joining ? '加入中...' : '加入房间'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
};

export default TexasPanel;
