interface StatCardsProps {
  stats: {
    totalGames: number;
    totalBuyIn: string;
    latestGameBalanceDiff: string;
    latestGameTurnover: string;
  };
}

const StatCards = ({ stats }: StatCardsProps) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-ai-section-type="card-stat">
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
        }}
      >
        <div className="text-sm mb-1" style={{ color: '#b8b8a8' }}>
          总场次
        </div>
        <div
          className="text-3xl font-bold font-mono"
          style={{ color: '#e8c96a' }}
        >
          {stats.totalGames}
        </div>
      </div>
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
        }}
      >
        <div className="text-sm mb-1" style={{ color: '#b8b8a8' }}>
          总买入
        </div>
        <div
          className="text-3xl font-bold font-mono"
          style={{ color: '#e8c96a' }}
        >
          ¥{Number(stats.totalBuyIn || 0).toFixed(2)}
        </div>
      </div>
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
        }}
      >
        <div className="text-sm mb-1" style={{ color: '#b8b8a8' }}>
          流水差
        </div>
        <div
          className="text-3xl font-bold font-mono"
          style={{
            color:
              Number(stats.latestGameBalanceDiff || 0) === 0
                ? '#22c55e'
                : '#ef4444',
          }}
        >
          ¥{Number(stats.latestGameBalanceDiff || 0).toFixed(2)}
        </div>
      </div>
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
        }}
      >
        <div className="text-sm mb-1" style={{ color: '#b8b8a8' }}>
          本局流水
        </div>
        <div
          className="text-3xl font-bold font-mono"
          style={{ color: '#e8c96a' }}
        >
          ¥{Number(stats.latestGameTurnover || 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
};

export default StatCards;
