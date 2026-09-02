import { useState, FormEvent } from 'react';
import { toast } from 'sonner';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';

interface UserCreationOverlayProps {
  deviceId: string | null;
  onCreated: (user: { id: string; name: string }) => void;
  createUser: (params: {
    name: string;
    deviceId: string;
  }) => Promise<{ user: { id: string; name: string } }>;
}

const UserCreationOverlay = ({
  deviceId,
  onCreated,
  createUser,
}: UserCreationOverlayProps) => {
  const [userNameInput, setUserNameInput] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = userNameInput.trim();
    if (!name) {
      toast.error('请输入你的名字');
      return;
    }
    if (!deviceId) {
      toast.error('设备ID未就绪，请刷新页面重试');
      return;
    }
    setCreating(true);
    try {
      const res = await createUser({ name, deviceId });
      onCreated({ id: res.user.id, name: res.user.name });
      toast.success('身份创建成功');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败，请重试';
      if (
        msg.includes('已被使用') ||
        msg.includes('duplicate') ||
        msg.includes('23505')
      ) {
        toast.error('该名字已被使用，请换一个');
      } else {
        toast.error(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-5"
      style={{
        background: 'linear-gradient(180deg, #0d4f2c 0%, #07301a 100%)',
      }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8 shadow-lg"
        style={{
          backgroundColor: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div className="text-center mb-8">
          <h2
            className="text-3xl font-bold mb-3"
            style={{ color: '#e8c96a' }}
          >
            创建你的身份
          </h2>
          <p style={{ color: '#c9c9bc' }}>
            输入你的名字，在所有牌局中使用
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label
              className="block text-sm mb-2"
              style={{ color: '#c9c9bc' }}
            >
              姓名
            </label>
            <Input
              type="text"
              value={userNameInput}
              onChange={(e) => setUserNameInput(e.target.value)}
              placeholder="请输入你的名字"
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
            {creating ? '创建中...' : '开始使用'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default UserCreationOverlay;
