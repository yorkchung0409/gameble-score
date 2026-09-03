interface StatCardsProps {
  totalGames: number;
}

const StatCards = ({ totalGames }: StatCardsProps) => {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-5 py-4 mb-4"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E6EAE2',
        boxShadow: '0 2px 12px rgba(30,40,34,0.08)',
      }}
    >
      <span className="text-sm" style={{ color: '#6B7A70' }}>
        总场次
      </span>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: '#222B26' }}
      >
        {totalGames}
      </span>
    </div>
  );
};

export default StatCards;
