interface StatCardsProps {
  totalGames: number;
}

const StatCards = ({ totalGames }: StatCardsProps) => {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-5 py-4 mb-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      <span className="text-sm" style={{ color: '#c9c9bc' }}>
        总场次
      </span>
      <span
        className="text-2xl font-bold font-mono"
        style={{ color: '#f2f2ea' }}
      >
        {totalGames}
      </span>
    </div>
  );
};

export default StatCards;
