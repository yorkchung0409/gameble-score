import type { MahjongSeat } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Plus, LogOut } from 'lucide-react';

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
                                        <svg
                      viewBox="0 0 1024 1024"
                      fill="currentColor"
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path d="M526.4 996c-213.6 0-405.6-143.2-467.2-347.2l30.4-9.6c57.6 191.2 236.8 324.8 436.8 324.8s379.2-133.6 436.8-324.8l30.4 9.6c-61.6 204-253.6 347.2-467.2 347.2z" />
                      <path d="M44 589.6l16.8 64c1.6 5.6 7.2 8.8 12.8 7.2l75.2-6.4c5.6-1.6 6.4-8.8 1.6-12L60 577.6c-8-4.8-18.4 2.4-16 12z" />
                      <path d="M978.4 643.2m-16 0a16 16 0 1 0 32 0 16 16 0 1 0-32 0Z" />
                      <path d="M75.2 380.8l-30.4-9.6C106.4 166.4 298.4 24 512 24s405.6 143.2 467.2 347.2l-30.4 9.6C891.2 189.6 712 56 512 56S132.8 189.6 75.2 380.8z" />
                      <path d="M994.4 430.4l-16.8-64c-1.6-5.6-7.2-8.8-12.8-7.2l-75.2 6.4c-5.6 1.6-6.4 8.8-1.6 12l90.4 64.8c8 4.8 18.4-3.2 16-12z" />
                      <path d="M60 376.8m-16 0a16 16 0 1 0 32 0 16 16 0 1 0-32 0Z" />
                      <path d="M475.2 430.4h-68.8l-33.6-84.8c-8-20.8 7.2-44 29.6-44 12.8 0 24.8 8 29.6 20l43.2 108.8zM554.4 430.4h68.8l33.6-84.8c8-20.8-7.2-44-29.6-44-12.8 0-24.8 8-29.6 20l-43.2 108.8zM512 797.6c-19.2 0-34.4-15.2-34.4-34.4V494.4h68.8v268c0 19.2-15.2 35.2-34.4 35.2z" />
                      <path d="M668.8 497.6H355.2c-19.2 0-34.4-15.2-34.4-34.4s15.2-34.4 34.4-34.4h314.4c19.2 0 34.4 15.2 34.4 34.4-0.8 19.2-16 34.4-35.2 34.4zM668.8 606.4H355.2c-19.2 0-34.4-15.2-34.4-34.4s15.2-34.4 34.4-34.4h314.4c19.2 0 34.4 15.2 34.4 34.4-0.8 18.4-16 34.4-35.2 34.4z" />
                    </svg>
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
