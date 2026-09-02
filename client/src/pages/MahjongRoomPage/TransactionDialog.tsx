import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { toast } from 'sonner';
import { Plus, User } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import type {
  MahjongSeat,
  CreateTransactionRequest,
} from '@shared/api.interface';

export interface TransactionDialogHandle {
  open: (preselectedPayeeId?: string) => void;
}

interface TransactionDialogProps {
  seats: MahjongSeat[];
  currentUserId: string;
  onSubmit: (payload: CreateTransactionRequest) => Promise<void>;
  submitting: boolean;
}

const TransactionDialog = forwardRef<
  TransactionDialogHandle,
  TransactionDialogProps
>(
  (
    { seats, currentUserId, onSubmit, submitting }: TransactionDialogProps,
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [payeeValue, setPayeeValue] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [remark, setRemark] = useState('');

    const currentSeat = seats.find(
      (s: MahjongSeat) => s.userId === currentUserId,
    );

    const getDefaultPayee = (): string => {
      const firstOther = seats.find(
        (s: MahjongSeat) => s.userId !== currentUserId,
      );
      if (firstOther) return firstOther.userId;
      return 'tea_fee';
    };

    useImperativeHandle(ref, () => ({
      open: (preselectedPayeeId?: string) => {
        if (seats.length === 0) {
          toast.error('当前还没有入座的玩家');
          return;
        }
        if (preselectedPayeeId) {
          setPayeeValue(preselectedPayeeId);
        } else {
          setPayeeValue(getDefaultPayee());
        }
        setAmount('');
        setRemark('');
        setOpen(true);
      },
    }));

    useEffect(() => {
      if (open) {
        // 如果当前收款方已不在座位列表且不是茶水费，重置默认
        const isTeaFee = payeeValue === 'tea_fee';
        const stillExists =
          isTeaFee || seats.some((s: MahjongSeat) => s.userId === payeeValue);
        if (!stillExists) {
          setPayeeValue(getDefaultPayee());
        }
      }
    }, [open, seats]);

    const handleTriggerClick = () => {
      if (seats.length === 0) {
        toast.error('当前还没有入座的玩家');
        return;
      }
      setPayeeValue(getDefaultPayee());
      setAmount('');
      setRemark('');
      setOpen(true);
    };

    const handleSubmit = async () => {
      const amountNum = Number(amount);
      if (!amountNum || amountNum <= 0) {
        toast.error('金额必须大于 0');
        return;
      }
      const isTeaFee = payeeValue === 'tea_fee';
      if (!isTeaFee && currentUserId === payeeValue) {
        toast.error('付款方和收款方不能相同');
        return;
      }
      const payload: CreateTransactionRequest = {
        payerId: currentUserId,
        payeeType: isTeaFee ? 'tea_fee' : 'user',
        amount: amountNum,
        operatorUserId: currentUserId,
      };
      if (!isTeaFee) {
        payload.payeeId = payeeValue;
      }
      if (remark.trim()) {
        payload.remark = remark.trim();
      }
      await onSubmit(payload);
      setOpen(false);
    };

    const payerDisplay = currentSeat
      ? `${currentSeat.userName}（我）`
      : '--';

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            className="w-full sm:w-auto font-semibold mb-6"
            style={{
              backgroundColor: '#d4af37',
              color: '#07301a',
            }}
            onClick={handleTriggerClick}
          >
            <Plus className="w-4 h-4 mr-2" />
            手动转账
          </Button>
        </DialogTrigger>
        <DialogContent
          style={{
            backgroundColor: '#0a3d22',
            border: '1px solid rgba(255,255,255,0.16)',
            color: '#f0f0e8',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: '#f2f2ea' }}>
              手动转账
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#c9c9bc' }}
              >
                付款方
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-md font-semibold"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: '#f2f2ea',
                }}
              >
                <User className="w-4 h-4" />
                {payerDisplay}
              </div>
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#c9c9bc' }}
              >
                收款方
              </label>
              <Select value={payeeValue} onValueChange={setPayeeValue}>
                <SelectTrigger style={{ color: '#f0f0e8' }}>
                  <SelectValue placeholder="选择收款方" />
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: '#0a3d22',
                    border: '1px solid rgba(255,255,255,0.16)',
                    color: '#f0f0e8',
                  }}
                >
                  {seats.map((s: MahjongSeat) => (
                    <SelectItem
                      key={s.userId}
                      value={s.userId}
                      style={{ color: '#f0f0e8' }}
                    >
                      {s.userName}
                    </SelectItem>
                  ))}
                  <SelectItem value="tea_fee" style={{ color: '#f0f0e8' }}>
                    茶水费
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#c9c9bc' }}
              >
                金额
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="请输入金额"
                style={{ color: '#f0f0e8' }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#c9c9bc' }}
              >
                备注（选填）
              </label>
              <Input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="请输入备注"
                style={{ color: '#f0f0e8' }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              style={{
                color: '#f0f0e8',
                borderColor: 'rgba(255,255,255,0.2)',
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
              {submitting ? '提交中...' : '确认转账'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

TransactionDialog.displayName = 'TransactionDialog';

export default TransactionDialog;
