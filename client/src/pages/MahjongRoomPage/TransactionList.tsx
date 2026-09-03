import { RotateCcw } from 'lucide-react';
import type { MahjongTransaction } from '@shared/api.interface';

interface TransactionListProps {
  transactions: MahjongTransaction[];
  currentUserId: string;
  onReverse: (tx: MahjongTransaction) => void;
  /** 免费模式：提示点击头像转账 */
  avatarTransferHint?: boolean;
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
};

const TransactionList = ({
  transactions,
  currentUserId,
  onReverse,
  avatarTransferHint,
}: TransactionListProps) => {
  if (transactions.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E6EAE2',
          color: '#6B7A70',
        }}
      >
        还没有转账记录，点击头像转账开始记账
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E6EAE2',
      }}
    >
      <div
        className="px-3 py-2.5 text-sm font-semibold flex items-center justify-between"
        style={{
          color: '#222B26',
          borderBottom: '1px solid #EDF0EB',
        }}
      >
        <span>转账记录</span>
        <span
          className="text-xs font-normal text-right leading-tight"
          style={{ color: '#8a8a7a' }}
        >
          {avatarTransferHint ? '点击头像转账 · ' : ''}
          仅能冲正自己付款的记录
        </span>
      </div>
      <div
        className="max-h-[180px] overflow-y-auto divide-y"
        style={{ borderColor: '#EBEEE9' }}
      >
        {transactions.map((tx: MahjongTransaction) => {
          const isReversal = !!tx.reversalOf;
          const canReverse = tx.payerId === currentUserId;
          const amountNum = Number(tx.amount);
          return (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={isReversal ? { opacity: 0.75 } : undefined}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] mb-0.5 flex items-center gap-1.5"
                  style={{ color: '#6B7A70' }}
                >
                  {formatDate(tx.createdAt)}
                  {isReversal && (
                    <span
                      className="text-[10px] px-1.5 py-px rounded font-medium"
                      style={{
                        color: '#ffffff',
                        backgroundColor: '#B08D1E',
                      }}
                    >
                      冲正
                    </span>
                  )}
                </div>
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: '#222B26' }}
                >
                  <span style={{ color: '#E5484D' }}>{tx.payerName}</span>
                  <span style={{ color: '#6B7A70' }} className="mx-2">
                    →
                  </span>
                  <span style={{ color: '#12904D' }}>
                    {tx.payeeType === 'tea_fee'
                      ? '茶水费'
                      : tx.payeeName}
                  </span>
                </div>
                {tx.remark && (
                  <div
                    className="text-xs mt-1"
                    style={{ color: '#6B7A70' }}
                  >
                    备注：{tx.remark}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className="font-mono font-semibold"
                  style={{
                    color: isReversal ? '#9CA3AF' : '#222B26',
                  }}
                >
                  ¥{amountNum.toFixed(2)}
                </span>
                {canReverse && (
                  <button
                    className="p-1.5 rounded-md transition-colors hover:bg-black/10"
                    style={{ color: '#6B7A70' }}
                    onClick={() => onReverse(tx)}
                    title="冲正（撤销这笔转账）"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionList;
