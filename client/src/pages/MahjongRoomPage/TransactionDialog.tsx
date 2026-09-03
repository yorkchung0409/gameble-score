import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
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

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          style={{
            backgroundColor: '#0a3d22',
            border: '1px solid #E6EAE2',
            color: '#222B26',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: '#222B26' }}>
              手动转账
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
              >
                付款方
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-md font-semibold"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E6EAE2',
                  color: '#222B26',
                }}
              >
                <User className="w-4 h-4" />
                {currentUserName ? `${currentUserName}（我）` : '--'}
              </div>
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
              >
                收款方
              </label>
              <Select value={payeeValue} onValueChange={setPayeeValue}>
                <SelectTrigger style={{ color: '#222B26' }}>
                  <SelectValue placeholder="选择收款方" />
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: '#0a3d22',
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
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
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
                style={{ color: '#222B26' }}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: '#6B7A70' }}
              >
                备注（选填）
              </label>
              <Input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="请输入备注"
                style={{ color: '#222B26' }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              style={{
                color: '#222B26',
                borderColor: '#DCE3DC',
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                backgroundColor: '#1E7A46',
                color: '#ffffff',
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
