import type { MahjongSeat } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Plus, LogOut, Coins } from 'lucide-react';

interface SeatSectionProps {
  seats: MahjongSeat[];
  currentUserId: string;
  onSitDown: (seatIndex: number) => void;
  onLeaveSeat: () => void;
  onQuickTransfer: (payeeUserId: string) => void;
  canInteract: boolean;
  currentUserSeated: boolean;
}

const SEAT_COUNT = 4;
const SEAT_NAMES = ['东位', '南位', '西位', '北位'];

const SeatSection = ({
  seats,
  currentUserId,
  onSitDown,
  onLeaveSeat,
  onQuickTransfer,
  canInteract,
  currentUserSeated,
}: SeatSectionProps) => {
  const seatMap = new Map<number, MahjongSeat>();
  seats.forEach((s: MahjongSeat) => seatMap.set(s.seatIndex, s));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
      {Array.from({ length: SEAT_COUNT }).map((_, idx: number) => {
        const seat = seatMap.get(idx);
        const isMe = seat && seat.userId === currentUserId;
        const isOccupied = !!seat;

        return (
          <div
            key={idx}
            className="rounded-xl p-2.5 flex flex-col items-center relative"
            style={{
              backgroundColor: 'rgba(255,255,255,0.10)',
              border: isMe
                ? '2px solid #d4af37'
                : '1px solid rgba(255,255,255,0.16)',
              boxShadow: isMe
                ? '0 4px 20px rgba(255,255,255,0.16)'
                : '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            <div
              className="text-[10px] mb-1.5 font-medium"
              style={{ color: '#c9c9bc' }}
            >
              {SEAT_NAMES[idx]}
            </div>
            {isOccupied ? (
              <>
                <div
                  className="text-sm font-semibold mb-2 text-center truncate w-full"
                  style={{ color: '#f0f0e8' }}
                  title={seat.userName}
                >
                  {seat.userName}
                  {isMe && (
                    <span
                      className="text-[10px] ml-0.5"
                      style={{ color: '#d4af37' }}
                    >
                      （我）
                    </span>
                  )}
                </div>
                {isMe ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 [&_svg]:size-3.5"
                    style={{
                      color: '#ef4444',
                      borderColor: 'rgba(239,68,68,0.4)',
                    }}
                    onClick={onLeaveSeat}
                    aria-label="离开座位"
                  >
                    <LogOut />
                  </Button>
                ) : currentUserSeated ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 [&_svg]:size-3.5"
                    style={{
                      color: '#d4af37',
                      borderColor: 'rgba(212,175,55,0.4)',
                    }}
                    onClick={() => onQuickTransfer(seat.userId)}
                    aria-label="转账"
                    title={`向 ${seat.userName} 转账`}
                  >
                    <Coins />
                  </Button>
                ) : (
                  <div className="h-7 w-7" />
                )}
              </>
            ) : (
              <>
                <div
                  className="text-sm mb-2"
                  style={{ color: '#c9c9bc' }}
                >
                  空位
                </div>
                <Button
                  size="icon"
                  className="h-7 w-7 [&_svg]:size-3.5"
                  style={{
                    backgroundColor: '#d4af37',
                    color: '#07301a',
                  }}
                  onClick={() => onSitDown(idx)}
                  disabled={!canInteract}
                  aria-label="坐下"
                >
                  <Plus />
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SeatSection;
