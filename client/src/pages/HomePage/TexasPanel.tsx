import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import { pokerApi } from '@client/src/api';
import { useDeviceId } from '@client/src/hooks/useDeviceId';
import RecentRooms from '@client/src/components/RecentRooms';
import { useNavigate } from 'react-router-dom';

interface TexasPanelProps {
  gameType: string;
}

/**
 * 德州面板 = 私人账本（单人记账）
 * - 最近账本（房间）列表
 * - 新建账本（自动生成账本码，无需手动输入/加入）
 */
const TexasPanel = ({ gameType }: TexasPanelProps) => {
  const navigate = useNavigate();
  const deviceId = useDeviceId();

  const [roomName, setRoomName] = useState<string>('我的账本');
  const [creating, setCreating] = useState<boolean>(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      toast.error('请输入账本名称');
      return;
    }
    setCreating(true);
    try {
      const res = await pokerApi.createRoom({
        roomName: roomName.trim(),
        gameType,
      });
      toast.success('账本创建成功');
      navigate(`/room/${res.room.roomCode}`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : '创建账本失败，请重试',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div
        className="rounded-xl p-6 shadow-lg"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E6EAE2',
          boxShadow: '0 2px 12px rgba(30,40,34,0.08)',
        }}
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div>
            <label
              className="block text-sm mb-1.5"
              style={{ color: '#6B7A70' }}
            >
              账本名称
            </label>
            <Input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="例如：家里局 / 公司局 / 老家局"
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
            {creating ? '创建中...' : '＋ 新建账本'}
          </Button>
        </form>
      </div>
      <div className="mt-4">
        <RecentRooms
          deviceId={deviceId}
          gameType="texas"
          pathPrefix="/room/"
          emptyText="还没有账本，先新建一个吧"
        />
      </div>
    </>
  );
};

export default TexasPanel;
