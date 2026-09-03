import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { toast } from 'sonner';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import TeaFeeIcon from './TeaFeeIcon';
import type { CreateTransactionRequest } from '@shared/api.interface';

export interface PayeeOption {
  id: string;
  name: string;
}

export interface TransactionDialogHandle {
  open: (preselectedPayeeId?: string) => void;
}

interface TransactionDialogProps {
  payeeOptions: PayeeOption[];
  currentUserId: string;
  currentUserName: string;
  /** 坐下模式且无人入座时的提示，有值时阻止转账弹窗 */
  blockedMessage?: string;
  onSubmit: (payload: CreateTransactionRequest) => Promise<void>;
  submitting: boolean;
}

// 确定性头像配色：与成员区一致
const AVATAR_COLORS = [
  '#e8a13c',
  '#7fb3e0',
  '#e0706f',
  '#6fbf8b',
  '#9d8ad6',
  '#4db6ac',
  '#e57fb0',
  '#f28d4f',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarColor(userId: string): string {
  return AVATAR_COLORS[hashCode(userId) % AVATAR_COLORS.length];
}

const TransactionDialog = forwardRef<TransactionDialogHandle, TransactionDialogProps>(
  (
    {
      payeeOptions,
      currentUserId,
      currentUserName,
      blockedMessage,
      onSubmit,
      submitting,
    }: TransactionDialogProps,
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [payeeValue, setPayeeValue] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [remark, setRemark] = useState('');

    const canOpen = () => {
      if (blockedMessage) {
        toast.error(blockedMessage);
        return false;
      }
      return true;
    };

    const getDefaultPayee = (): string => {
      if (payeeOptions.length > 0) return payeeOptions[0].id;
      return 'tea_fee';
    };

    useImperativeHandle(ref, () => ({
      open: (preselectedPayeeId?: string) => {
        if (!canOpen()) return;
        setPayeeValue(preselectedPayeeId ?? getDefaultPayee());
        setAmount('');
        setRemark('');
        setOpen(true);
      },
    }));

    useEffect(() => {
      if (open) {
        const isTeaFee = payeeValue === 'tea_fee';
        const stillExists =
          isTeaFee || payeeOptions.some((o) => o.id === payeeValue);
        if (!stillExists) {
          setPayeeValue(getDefaultPayee());
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, payeeOptions]);

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

    const isTeaFee = payeeValue === 'tea_fee';
    const payeeName = isTeaFee
      ? '茶水费'
      : (payeeOptions.find((o) => o.id === payeeValue)?.name ?? '收款方');
    const myInitial = (currentUserName || '?').trim().charAt(0);

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E6EAE2',
            color: '#222B26',
          }}
        >
          <DialogHeader>
            <DialogTitle
              style={{ color: '#222B26', textAlign: 'center', fontSize: 18 }}
            >
              转账给{payeeName}
            </DialogTitle>
          </DialogHeader>

          {/* 付款方 → 收款方 一行（参考布局） */}
          <div className="flex items-center justify-center gap-3 py-2">
            <div className="flex flex-col items-center gap-1">
              <span
                className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                style={{ backgroundColor: avatarColor(currentUserId), color: '#ffffff' }}
                aria-hidden="true"
              >
                {myInitial}
              </span>
              <span className="text-xs" style={{ color: '#222B26' }}>
                {currentUserName ? `${currentUserName}（我）` : '--'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5 px-1">
              <ArrowRight className="w-5 h-5" style={{ color: '#6B7A70' }} />
              <span className="text-[10px]" style={{ color: '#6B7A70' }}>
                转账
              </span>
            </div>

            {/* 收款方：可点击切换 */}
            <div className="flex flex-col items-center gap-1">
              <Select value={payeeValue} onValueChange={setPayeeValue}>
                <SelectTrigger
                  asChild
                  className="border-0 bg-transparent p-0 shadow-none justify-center rounded-none"
                  style={{ height: 'auto', color: '#222B26', boxShadow: 'none' }}
                >
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1 outline-none"
                  >
                    {isTeaFee ? (
                      <span
                        className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: '#B08D1E', color: '#ffffff' }}
                        aria-hidden="true"
                      >
                        <TeaFeeIcon size={22} />
                      </span>
                    ) : (
                      <span
                        className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                        style={{ backgroundColor: avatarColor(payeeValue), color: '#ffffff' }}
                        aria-hidden="true"
                      >
                        {(payeeName || '?').trim().charAt(0)}
                      </span>
                    )}
                    <span
                      className="text-xs flex items-center gap-0.5"
                      style={{ color: '#222B26' }}
                    >
                      {payeeName}
                      <ChevronDown className="size-3" style={{ color: '#6B7A70' }} />
                    </span>
                  </button>
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E6EAE2',
                    color: '#222B26',
                  }}
                >
                  {payeeOptions.map((o) => (
                    <SelectItem
                      key={o.id}
                      value={o.id}
                      style={{ color: '#222B26' }}
                    >
                      {o.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="tea_fee" style={{ color: '#222B26' }}>
                    茶水费
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="输入金额"
              style={{ color: '#222B26', textAlign: 'center' }}
            />
            <Input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="备注（选填）"
              style={{ color: '#222B26' }}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full font-semibold mt-3"
            style={{
              backgroundColor: '#1E7A46',
              color: '#ffffff',
            }}
          >
            {submitting ? '提交中...' : '确认转账'}
          </Button>
        </DialogContent>
      </Dialog>
    );
  },
);

TransactionDialog.displayName = 'TransactionDialog';

export default TransactionDialog;
