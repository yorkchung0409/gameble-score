import { RotateCcw } from 'lucide-react';
import type { MahjongTransaction } from '@shared/api.interface';

interface TransactionListProps {
  transactions: MahjongTransaction[];
  currentUserId: string;
  onReverse: (tx: MahjongTransaction) => void;
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
}: TransactionListProps) => {
  if (transactions.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{
          backgroundColor: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#c9c9bc',
        }}
      >
        还没有转账记录，点击手动转账开始记账
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.16)',
      }}
    >
      <div
        className="px-4 py-3 text-sm font-semibold flex items-center justify-between"
        style={{
          color: '#f2f2ea',
          borderBottom: '1px solid rgba(0,0,0,0.25)',
        }}
      >
        <span>转账记录</span>
        <span className="text-xs font-normal" style={{ color: '#8a8a7a' }}>
          仅能冲正自己付款的记录
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        {transactions.map((tx: MahjongTransaction) => {
          const isReversal = !!tx.reversalOf;
          const canReverse = tx.payerId === currentUserId;
          const amountNum = Number(tx.amount);
          return (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={isReversal ? { opacity: 0.75 } : undefined}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs mb-1 flex items-center gap-1.5"
                  style={{ color: '#c9c9bc' }}
                >
                  {formatDate(tx.createdAt)}
                  {isReversal && (
                    <span
                      className="text-[10px] px-1.5 py-px rounded font-medium"
                      style={{
                        color: '#07301a',
                        backgroundColor: '#e8c96a',
                      }}
                    >
                      冲正
                    </span>
                  )}
                </div>
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: '#f0f0e8' }}
                >
                  <span style={{ color: '#ef4444' }}>{tx.payerName}</span>
                  <span style={{ color: '#c9c9bc' }} className="mx-2">
                    →
                  </span>
                  <span style={{ color: '#22c55e' }}>
                    {tx.payeeType === 'tea_fee'
                      ? '茶水费'
                      : tx.payeeName}
                  </span>
                </div>
                {tx.remark && (
                  <div
                    className="text-xs mt-1"
                    style={{ color: '#c9c9bc' }}
                  >
                    备注：{tx.remark}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className="font-mono font-semibold"
                  style={{
                    color: isReversal ? '#c9c9bc' : '#f2f2ea',
                  }}
                >
                  ¥{amountNum.toFixed(2)}
                </span>
                {canReverse && (
                  <button
                    className="p-1.5 rounded-md transition-colors hover:bg-white/10"
                    style={{ color: '#c9c9bc' }}
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
