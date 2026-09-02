interface BalanceItem {
  userId: string;
  userName: string;
  balance: string;
}

interface ScoreBoardProps {
  balances: BalanceItem[];
  teaFeeTotal: string;
  totalTurnover: string;
  balanceCheckPassed: boolean;
}

const ScoreBoard = ({
  balances,
  teaFeeTotal,
  totalTurnover,
  balanceCheckPassed,
}: ScoreBoardProps) => {
  const getBalanceColor = (val: string): string => {
    const n = Number(val);
    if (n > 0) return '#22c55e';
    if (n < 0) return '#ef4444';
    return '#c9c9bc';
  };

  return (
    <div
      className="rounded-xl px-3 py-2.5 mb-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {balances.length === 0 ? (
          <div
            className="text-xs flex-1 text-center py-1"
            style={{ color: '#c9c9bc' }}
          >
            暂无入座玩家
          </div>
        ) : (
          balances.map((b: BalanceItem) => (
            <div
              key={b.userId}
              className="flex flex-col items-center min-w-0"
              style={{ flex: '1 1 0' }}
            >
              <div
                className="text-xs mb-0.5 truncate max-w-full"
                style={{ color: '#c9c9bc' }}
                title={b.userName}
              >
                {b.userName}
              </div>
              <div
                className="text-sm font-bold font-mono whitespace-nowrap"
                style={{ color: getBalanceColor(b.balance) }}
              >
                {Number(b.balance) >= 0 ? '+' : ''}
                {Number(b.balance).toFixed(2)}
              </div>
            </div>
          ))
        )}
        {balances.length > 0 && (
          <div
            className="flex flex-col items-center"
            style={{
              paddingLeft: '12px',
              borderLeft: '1px solid rgba(212,175,55,0.2)',
            }}
          >
            <div
              className="text-xs mb-0.5"
              style={{ color: '#c9c9bc' }}
            >
              茶水费
            </div>
            <div
              className="text-sm font-semibold font-mono whitespace-nowrap"
              style={{ color: '#e8c96a' }}
            >
              ¥{Number(teaFeeTotal).toFixed(2)}
            </div>
          </div>
        )}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 text-xs"
        style={{ borderTop: '1px solid rgba(0,0,0,0.25)' }}
      >
        <div>
          <span style={{ color: '#c9c9bc' }}>总流水：</span>
          <span
            className="font-mono font-semibold"
            style={{ color: '#f0f0e8' }}
          >
            ¥{Number(totalTurnover).toFixed(2)}
          </span>
        </div>
        <div className="flex items-center">
          <span style={{ color: '#c9c9bc' }}>账目：</span>
          <span
            className="font-semibold"
            style={{
              color: balanceCheckPassed ? '#22c55e' : '#ef4444',
            }}
          >
            {balanceCheckPassed ? '已平衡' : '不平衡'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScoreBoard;
