interface ScoreBoardProps {
  totalTurnover: string;
  balanceCheckPassed: boolean;
}

const ScoreBoard = ({ totalTurnover, balanceCheckPassed }: ScoreBoardProps) => {
  return (
    <div className="flex items-center justify-between text-xs mb-3">
      <div>
        <span style={{ color: '#c9c9bc' }}>总流水 </span>
        <span className="font-mono font-semibold" style={{ color: '#f0f0e8' }}>
          ¥{Number(totalTurnover).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span style={{ color: '#c9c9bc' }}>账目</span>
        <span
          className="font-semibold"
          style={{ color: balanceCheckPassed ? '#22c55e' : '#ef4444' }}
        >
          {balanceCheckPassed ? '已平衡' : '不平衡'}
        </span>
      </div>
    </div>
  );
};

export default ScoreBoard;
