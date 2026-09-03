interface StatCardsProps {
  totalGames: number;
}

const StatCards = ({ totalGames }: StatCardsProps) => {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-5 py-4 mb-4"
      style={{
        background: 'linear-gradient(135deg, #EAF4ED, #E0EFE6)',
        border: '1px solid #DFEBE2',
      }}
    >
      <span className="text-sm" style={{ color: '#6B7A70' }}>
        总场次
      </span>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: '#1E7A46' }}
      >
        {totalGames}
      </span>
    </div>
  );
};

export default StatCards;
