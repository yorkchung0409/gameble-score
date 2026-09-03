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
import { mahjongApi } from '@client/src/api';
import { useMahjongUser } from '@client/src/hooks/useMahjongUser';
import RecentRooms from '@client/src/components/RecentRooms';
import { useNavigate } from 'react-router-dom';

const MahjongPanel = () => {
  const navigate = useNavigate();
  const { currentUser, deviceId } = useMahjongUser();
  const [activeTab, setActiveTab] = useState<string>('create');

  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  const [joinCode, setJoinCode] = useState<string>('');
  const [joining, setJoining] = useState<boolean>(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await mahjongApi.createRoom({
        name: '麻将牌局',
        roomCode: roomCodeInput.trim() || undefined,
        creatorUserId: currentUser?.id,
      });
      toast.success('房间创建成功');
      navigate(`/mahjong/${res.room.roomCode}`);
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
      await mahjongApi.getRoom(joinCode.trim());
      toast.success('加入成功');
      navigate(`/mahjong/${joinCode.trim()}`);
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
    <div
      className="rounded-xl p-4 shadow-lg"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E6EAE2',
        boxShadow: '0 2px 12px rgba(30,40,34,0.08)',
      }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 bg-[#E8ECE6]">
          <TabsTrigger value="create" className="flex-1 text-[#222B26]">
            创建房间
          </TabsTrigger>
          <TabsTrigger value="join" className="flex-1 text-[#222B26]">
            加入房间
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
              >
                房间码（选填，留空自动生成）
              </label>
              <Input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="自定义房间码"
                style={{ color: '#222B26' }}
              />
            </div>
            <Button
              type="submit"
              disabled={creating}
              className="w-full font-semibold mt-2"
              style={{
                backgroundColor: '#1E7A46',
                color: '#ffffff',
              }}
            >
              {creating ? '创建中...' : '创建房间'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="join">
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
              >
                房间码
              </label>
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="请输入房间码"
                style={{ color: '#222B26' }}
              />
            </div>
            <Button
              type="submit"
              disabled={joining}
              className="w-full font-semibold mt-2"
              style={{
                backgroundColor: '#1E7A46',
                color: '#ffffff',
              }}
            >
              {joining ? '加入中...' : '加入房间'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
    <div className="mt-4">
      <RecentRooms
        deviceId={deviceId}
        gameType="mahjong"
        pathPrefix="/mahjong/"
      />
    </div>
    </>
  );
};

export default MahjongPanel;
