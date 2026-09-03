interface ScoreBoardProps {
  totalTurnover: string;
  balanceCheckPassed: boolean;
}

const ScoreBoard = ({ totalTurnover, balanceCheckPassed }: ScoreBoardProps) => {
  return (
    <div className="flex items-center justify-between text-xs mb-3">
      <div>
        <span style={{ color: '#6B7A70' }}>总流水 </span>
        <span className="font-mono font-semibold" style={{ color: '#222B26' }}>
          ¥{Number(totalTurnover).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span style={{ color: '#6B7A70' }}>账目</span>
        <span
          className="font-semibold"
          style={{ color: balanceCheckPassed ? '#12904D' : '#E5484D' }}
        >
          {balanceCheckPassed ? '已平衡' : '不平衡'}
        </span>
      </div>
    </div>
  );
};

export default ScoreBoard;
