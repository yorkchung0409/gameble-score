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
    <section
      className="rounded-xl p-5 mb-5"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E6EAE2',
        boxShadow: '0 2px 12px rgba(30,40,34,0.08)',
      }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium" style={{ color: '#222B26' }}>
          设置昵称
        </label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={userNameInput}
            onChange={(e) => setUserNameInput(e.target.value)}
            placeholder="请输入你的名字"
            style={{ color: '#222B26' }}
          />
          <Button
            type="submit"
            disabled={creating}
            className="shrink-0 font-semibold"
            style={{
              backgroundColor: '#1E7A46',
              color: '#ffffff',
            }}
          >
            {creating ? '创建中...' : '确认'}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default UserCreationOverlay;
