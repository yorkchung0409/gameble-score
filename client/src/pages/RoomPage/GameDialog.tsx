import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@client/src/components/ui/popover';
import { Calendar } from '@client/src/components/ui/calendar';
import type {
  Player,
  Game,
  CreateGameRequest,
} from '@shared/api.interface';

interface GamePlayerRow {
  playerId: string;
  buyIn: string;
  balance: string;
}

interface GameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  initialGame?: Game;
  onSubmit: (data: CreateGameRequest) => Promise<void>;
}

const GameDialog = ({
  open,
  onOpenChange,
  players,
  initialGame,
  onSubmit,
}: GameDialogProps) => {
  const isEdit = !!initialGame;

  const [gameDate, setGameDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<GamePlayerRow[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      if (initialGame) {
        setGameDate(dayjs(initialGame.gameDate).toDate());
        setRows(
          initialGame.players.map((p) => ({
            playerId: p.playerId,
            buyIn: String(p.buyIn),
            balance: String(p.balance),
          })),
        );
      } else {
        setGameDate(new Date());
        setRows([]);
      }
    }
  }, [open, initialGame]);

  const usedPlayerIds = useMemo(
    () => new Set(rows.filter((r) => r.playerId).map((r) => r.playerId)),
    [rows],
  );

  const addRow = () => {
    setRows([...rows, { playerId: '', buyIn: '', balance: '' }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (
    index: number,
    field: keyof GamePlayerRow,
    value: string,
  ) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value };
    setRows(next);
  };

  const handleSubmit = async () => {
    if (rows.length === 0) {
      toast.error('请至少添加一位人员');
      return;
    }
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (!r.playerId) {
        toast.error(`第${i + 1}行请选择人员`);
        return;
      }
      if (r.buyIn !== '' && Number(r.buyIn) < 0) {
        toast.error(`第${i + 1}行买入不能为负数`);
        return;
      }
      if (r.balance !== '' && Number(r.balance) < 0) {
        toast.error(`第${i + 1}行结余不能为负数`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit({
        gameDate: dayjs(gameDate).format('YYYY-MM-DD'),
        players: rows.map((r) => ({
          playerId: r.playerId,
          buyIn: r.buyIn === '' ? 0 : Number(r.buyIn),
          balance: r.balance === '' ? 0 : Number(r.balance),
        })),
      });
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: '#0a3d22',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#f0f0e8',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#f2f2ea' }}>
            {isEdit ? '编辑牌局' : '添加牌局'}
          </DialogTitle>
        </DialogHeader>

        {/* Date picker */}
        <div>
          <label
            className="block text-sm mb-1.5"
            style={{ color: '#c9c9bc' }}
          >
            日期
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                style={{
                  color: '#f0f0e8',
                  borderColor: 'rgba(255,255,255,0.16)',
                }}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dayjs(gameDate).format('YYYY-MM-DD')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={gameDate}
                onSelect={(d) => d && setGameDate(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Player rows header */}
        <div className="grid grid-cols-12 gap-2 text-sm" style={{ color: '#c9c9bc' }}>
          <div className="col-span-4">人员</div>
          <div className="col-span-3 text-right">买入</div>
          <div className="col-span-3 text-right">结余</div>
          <div className="col-span-2 text-center">操作</div>
        </div>

        {/* Player rows */}
        <div className="flex flex-col gap-2">
          {rows.length === 0 && (
            <div
              className="text-center py-6 rounded-lg"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                color: '#c9c9bc',
              }}
            >
              还没有人员，点击下方「添加人员」按钮
            </div>
          )}
          {rows.map((row, index) => {
            return (
              <div
                key={index}
                className="grid grid-cols-12 gap-2 items-center"
              >
                <div className="col-span-4">
                  <Select
                    value={row.playerId}
                    onValueChange={(v) => updateRow(index, 'playerId', v)}
                  >
                    <SelectTrigger className="w-full" style={{ color: '#f0f0e8' }}>
                      <SelectValue placeholder="选择人员" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={
                            p.id !== row.playerId && usedPlayerIds.has(p.id)
                          }
                        >
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 min-w-0">
                  <Input
                    type="number"
                    value={row.buyIn}
                    onChange={(e) => updateRow(index, 'buyIn', e.target.value)}
                    placeholder="0"
                    className="text-right font-mono"
                    style={{ color: '#f0f0e8' }}
                  />
                </div>
                <div className="col-span-3 min-w-0">
                  <Input
                    type="number"
                    value={row.balance}
                    onChange={(e) =>
                      updateRow(index, 'balance', e.target.value)
                    }
                    placeholder="0"
                    className="text-right font-mono"
                    style={{ color: '#f0f0e8' }}
                  />
                </div>
                <div className="col-span-2 flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-[#c9c9bc] hover:text-red-400"
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          onClick={addRow}
          disabled={players.length === 0}
          style={{
            color: '#f2f2ea',
            borderColor: 'rgba(255,255,255,0.16)',
          }}
        >
          <Plus className="w-4 h-4" />
          添加人员
        </Button>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            style={{
              color: '#f0f0e8',
              borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              backgroundColor: '#d4af37',
              color: '#07301a',
            }}
          >
            {submitting ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GameDialog;
