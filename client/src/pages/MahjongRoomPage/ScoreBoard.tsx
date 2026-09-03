interface ScoreBoardProps {
  totalTurnover: string;
  balanceCheckPassed: boolean;
}

const ScoreBoard = ({ totalTurnover, balanceCheckPassed }: ScoreBoardProps) => {
  return (
    <div
      className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between"
      style={{ background: 'linear-gradient(135deg, #F9F1DE, #F2E6C4)' }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs" style={{ color: '#8A7A45' }}>总流水</span>
        <span className="text-base font-semibold tabular-nums" style={{ color: '#B08D1E' }}>
          ¥{Number(totalTurnover).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: '#8A7A45' }}>账目</span>
        <span
          className="text-sm font-semibold"
          style={{ color: balanceCheckPassed ? '#12904D' : '#E5484D' }}
        >
          {balanceCheckPassed ? '已平衡' : '不平衡'}
        </span>
      </div>
    </div>
  );
};

export default ScoreBoard;
