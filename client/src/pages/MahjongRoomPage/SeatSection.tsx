import type { MahjongSeat } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { ArrowRightLeft, LogOut, Plus } from 'lucide-react';

interface SeatSectionProps {
  seats: MahjongSeat[];
  balances: { userId: string; userName: string; balance: string }[];
  currentUserId: string;
  onSitDown: (seatIndex: number) => void;
  onLeaveSeat: () => void;
  onQuickTransfer: (payeeUserId: string) => void;
  canInteract: boolean;
  currentUserSeated: boolean;
}

const SEAT_LAYOUT = [
  { seatIndex: 3, name: '北', gridArea: '1 / 2' },
  { seatIndex: 0, name: '东', gridArea: '2 / 3' },
  { seatIndex: 1, name: '南', gridArea: '3 / 2' },
  { seatIndex: 2, name: '西', gridArea: '2 / 1' },
] as const;

function formatScore(value: string | undefined) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)}`;
}

const SeatSection = ({
  seats,
  balances,
  currentUserId,
  onSitDown,
  onLeaveSeat,
  onQuickTransfer,
  canInteract,
  currentUserSeated,
}: SeatSectionProps) => {
  const seatMap = new Map<number, MahjongSeat>();
  seats.forEach((seat) => seatMap.set(seat.seatIndex, seat));
  const balanceMap = new Map(balances.map((balance) => [balance.userId, balance.balance]));

  return (
    <div className="mb-6">
      <div
        className="grid w-full max-w-[430px] mx-auto gap-1.5"
        style={{
          gridTemplateColumns: 'minmax(0, 1fr) minmax(88px, 1.08fr) minmax(0, 1fr)',
          gridTemplateRows: 'repeat(3, 92px)',
        }}
      >
        <div
          className="mx-auto flex h-[86px] w-[86px] flex-col items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 text-white shadow-inner"
          style={{ gridArea: '2 / 2', alignSelf: 'center' }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-bold text-emerald-700">
            雀
          </div>
          <span className="mt-2 text-[11px] text-emerald-50">坐下模式</span>
        </div>

        {SEAT_LAYOUT.map(({ seatIndex, name, gridArea }) => {
          const seat = seatMap.get(seatIndex);
          const isMe = seat?.userId === currentUserId;
          const scoreValue = seat ? balanceMap.get(seat.userId) : undefined;
          const score = Number(scoreValue) || 0;

          return (
            <div
              key={seatIndex}
              className="flex min-w-0 flex-col items-center justify-center rounded-lg border bg-white px-1.5 py-2 text-center shadow-sm"
              style={{
                gridArea,
                borderColor: isMe ? '#1E7A46' : '#E1E6E1',
                borderWidth: isMe ? 2 : 1,
                boxShadow: isMe ? '0 4px 14px rgba(30,122,70,0.18)' : undefined,
              }}
            >
              <span className="text-sm font-bold text-emerald-700">{name}</span>
              {seat ? (
                <>
                  <span className="mt-0.5 w-full truncate text-xs font-semibold text-[#222B26]" title={seat.userName}>
                    {seat.userName}{isMe ? '（我）' : ''}
                  </span>
                  <span
                    className="mt-1 font-mono text-sm font-bold"
                    style={{ color: score > 0 ? '#168447' : score < 0 ? '#C3443C' : '#59665E' }}
                  >
                    {formatScore(scoreValue)}
                  </span>
                  {isMe ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="mt-1 h-6 w-6 [&_svg]:size-3"
                      style={{ color: '#C3443C', borderColor: '#E7B9B6' }}
                      onClick={onLeaveSeat}
                      aria-label="离开座位"
                      title="离开座位"
                    >
                      <LogOut />
                    </Button>
                  ) : currentUserSeated ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="mt-1 h-6 w-6 [&_svg]:size-3"
                      style={{ color: '#967A20', borderColor: '#DDCE99' }}
                      onClick={() => onQuickTransfer(seat.userId)}
                      aria-label={`向 ${seat.userName} 转账`}
                      title={`向 ${seat.userName} 转账`}
                    >
                      <ArrowRightLeft />
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="my-1.5 text-xs text-[#8A958D]">空位</span>
                  <Button
                    size="icon"
                    className="h-7 w-7 bg-emerald-700 text-white hover:bg-emerald-800 [&_svg]:size-3.5"
                    onClick={() => onSitDown(seatIndex)}
                    disabled={!canInteract}
                    aria-label={`坐到${name}位`}
                    title={`坐到${name}位`}
                  >
                    <Plus />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SeatSection;
