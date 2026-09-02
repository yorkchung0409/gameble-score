import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import type { Player } from '@shared/api.interface';

interface PlayerManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  onAddPlayer: (name: string) => Promise<void>;
  onDeletePlayer: (playerId: string) => Promise<void>;
}

const PlayerManageDialog = ({
  open,
  onOpenChange,
  players,
  onAddPlayer,
  onDeletePlayer,
}: PlayerManageDialogProps) => {
  const [name, setName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('请输入人员姓名');
      return;
    }
    setSubmitting(true);
    try {
      await onAddPlayer(name.trim());
      setName('');
      toast.success('添加成功');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (playerId: string, playerName: string) => {
    if (!window.confirm(`确定删除人员「${playerName}」吗？`)) return;
    setDeletingId(playerId);
    try {
      await onDeletePlayer(playerId);
      toast.success('删除成功');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: '#0a3d22',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#f0f0e8',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#f2f2ea' }}>人员管理</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入人员姓名"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            style={{ color: '#f0f0e8' }}
          />
          <Button
            onClick={handleAdd}
            disabled={submitting}
            style={{
              backgroundColor: '#d4af37',
              color: '#07301a',
            }}
          >
            <Plus className="w-4 h-4" />
            添加
          </Button>
        </div>

        <div
          className="max-h-80 overflow-y-auto rounded-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          {players.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#c9c9bc' }}>
              暂无人员
            </div>
          ) : (
            <ul>
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255_255_255_0.05)] last:border-0"
                >
                  <span style={{ color: '#f0f0e8' }}>{p.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[#c9c9bc] hover:text-red-400"
                    disabled={deletingId === p.id}
                    onClick={() => handleDelete(p.id, p.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            style={{ color: '#f0f0e8', borderColor: 'rgba(255,255,255,0.16)' }}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlayerManageDialog;
