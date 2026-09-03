import type { MahjongRoomMember } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';

interface BalanceItem {
  userId: string;
  userName: string;
  balance: string;
}

interface MemberSectionProps {
  members: MahjongRoomMember[];
  balances: BalanceItem[];
  teaFeeTotal: string;
  currentUserId: string;
  onQuickTransfer: (payeeId: string) => void;
}

function fmtBalance(v: string): string {
  const n = Number(v) || 0;
  return (n > 0 ? '+' : '') + n.toFixed(2);
}

// 确定性头像配色：同一用户在各处颜色一致
const AVATAR_COLORS = [
  '#e8a13c',
  '#7fb3e0',
  '#e0706f',
  '#6fbf8b',
  '#9d8ad6',
  '#4db6ac',
  '#e57fb0',
  '#f28d4f',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarColor(userId: string): string {
  return AVATAR_COLORS[hashCode(userId) % AVATAR_COLORS.length];
}

function Avatar({ userId, name }: { userId: string; name: string }) {
  const ch = (name || '?').trim().charAt(0);
  return (
    <span
      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: avatarColor(userId), color: '#fff' }}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
}

// 快速转账图标（¥ 金币 + 双向箭头），与座位区保持一致
const TRANSFER_SVG = (
  <svg
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className="size-3"
    aria-hidden="true"
  >
    <path d="M545.3824 468.1984v79.2576h125.1584c16.6656 0 31.2832 14.592 31.2832 31.2832s-14.592 31.3088-31.2832 31.3088h-125.184v141.824c0 16.6912-14.592 31.3088-31.2576 31.3088-16.6912 0-31.3088-14.592-31.3088-31.3088v-141.824H357.632c-16.6656 0-31.2832-14.592-31.2832-31.3088 0-16.6656 14.592-31.2832 31.2832-31.2832h125.184V468.224h-125.184c-16.6656 0-31.2832-14.592-31.2832-31.2832s14.592-31.3088 31.2832-31.3088h81.3568l-75.0848-75.0848a30.2336 30.2336 0 0 1 0-43.8016 30.2336 30.2336 0 0 1 43.8016 0l98.048 98.048c4.1728 4.1728 6.2464 8.3456 8.3456 14.592 2.0736-4.1728 4.1472-8.3456 8.32-12.5184L622.592 286.72a30.2336 30.2336 0 0 1 43.776 0 30.2336 30.2336 0 0 1 0 43.8016l-75.0848 75.0848h81.3568c16.6912 0 31.2832 14.592 31.2832 31.3088 0 16.6912-14.592 31.2832-31.2832 31.2832h-127.232z m346.2656-8.3456c-45.9008-29.184-52.1472-35.456-52.1472-35.456-27.136-20.864-22.9632-45.9008 10.4192-56.32l114.7392-35.456s6.2464 6.2464 20.8384 64.6656c14.592 58.3936 14.592 100.096 14.592 100.096 2.0992 22.9632-12.4928 31.3088-31.2832 16.7168 0 0-52.1472-39.6544-77.1584-54.2464zM111.5136 591.2576c47.9744 27.136 60.4928 37.5552 60.4928 37.5552 29.184 18.7648 27.1104 41.728-6.272 54.2464l-112.64 35.456s-8.3456-8.3456-25.0368-64.6656c-16.6912-56.32-16.6912-104.2944-16.6912-104.2944-2.0736-22.9632 12.544-29.2096 29.2096-14.592 0 0 47.9744 41.7024 70.912 56.32zM17.6384 426.496c0-2.0736 2.0736-22.9376 8.3456-22.9376H23.8848h2.0992c2.0736-10.4192 14.592-16.6912 25.0368-12.5184 0 0 2.0736 4.1728 14.592 2.0992 12.5184-2.0992 43.8016-20.864 43.8016-20.864 10.4192-6.272 16.6912 0 12.5184 10.4192l-8.3456 33.3824c-2.0736 10.4192-14.592 20.864-25.0368 20.864H30.1568c-12.544 0-14.592-6.272-12.544-10.4448 0 0 0 2.0992 0 0z m878.1824 200.2688c2.0736-4.1728 0-2.0992 0 0 2.0736-12.544 12.5184-22.9632 25.0112-22.9632h56.32c10.4448 0 16.6912 8.3456 14.592 18.7904l-12.4928 37.5296c-6.272 12.544-16.6912 18.7904-29.184 18.7904l-48-6.272c-10.4192-2.0736-16.6912-10.4192-14.592-22.9376 0 0 8.3456-18.7904 8.3456-22.9376z m-869.8368 14.592C80.2048 858.2656 274.176 1018.88 505.728 1018.88c206.5152 0 383.8208-129.3312 458.9312-310.784 8.32-20.864 16.6656-43.8272 22.9376-66.7648h-91.776c-52.1472 166.8608-206.5152 287.8464-390.0672 287.8464S165.7344 808.192 113.5872 641.3312H25.984zM19.712 420.224a636.928 636.928 0 0 1 14.592-60.4928C99.0208 157.3888 284.672 11.392 505.7792 11.392c225.28 0 417.1776 154.368 475.5712 365.0304 4.1728 14.592 8.3456 29.184 10.4448 43.776h-91.776C856.1664 238.7712 695.552 105.2672 503.6544 105.2672c-191.8976 0-354.6112 133.504-396.3136 314.9824H19.712z m525.6704 47.9744v79.2576h125.1584c16.6656 0 31.2832 14.592 31.2832 31.2832s-14.592 31.3088-31.2832 31.3088h-125.184v141.824c0 16.6912-14.592 31.3088-31.2576 31.3088-16.6912 0-31.3088-14.592-31.3088-31.3088v-141.824H357.632c-16.6656 0-31.2832-14.592-31.2832-31.3088 0-16.6656 14.592-31.2832 31.2832-31.2832h125.184V468.224h-125.184c-16.6656 0-31.2832-14.592-31.2832-31.2832s14.592-31.2832 31.2832-31.2832h81.3568l-75.0848-75.1104a30.2336 30.2336 0 0 1 0-43.776 30.2336 30.2336 0 0 1 43.776 0l98.048 98.0224c4.1984 4.1728 6.272 8.3456 8.3712 14.592 2.0736-4.1728 4.1472-8.3456 8.32-12.5184l100.1472-100.096a30.2336 30.2336 0 0 1 43.776 0 30.2336 30.2336 0 0 1 0 43.776l-75.0848 75.1104h81.3568c16.6912 0 31.2832 14.592 31.2832 31.2832s-14.592 31.2832-31.2832 31.2832h-127.232z m346.2656-8.3456c-45.9008-29.184-52.1472-35.456-52.1472-35.456-27.136-20.864-22.9632-45.9008 10.4192-56.32l114.7392-35.456s6.2464 6.2464 20.8384 64.6656c14.592 58.3936 14.592 100.096 14.592 100.096 2.0992 22.9632-12.4928 31.3088-31.2832 16.7168 0 0-52.1472-39.6544-77.1584-54.2464zM111.5136 591.2576c47.9744 27.136 60.4928 37.5552 60.4928 37.5552 29.184 18.7648 27.1104 41.728-6.272 54.2464l-112.64 35.456s-8.3456-8.3456-25.0368-64.6656c-16.6912-56.32-16.6912-104.2944-16.6912-104.2944-2.0736-22.9632 12.544-29.2096 29.2096-14.592 0 0 47.9744 41.7024 70.912 56.32zM17.6384 426.496c0-2.0736 2.0736-22.9376 8.3456-22.9376H23.8848h2.0992c2.0736-10.4192 14.592-16.6912 25.0368-12.5184 0 0 2.0736 4.1728 14.592 2.0992 12.5184-2.0992 43.8016-20.864 43.8016-20.864 10.4192-6.272 16.6912 0 12.5184 10.4192l-8.3456 33.3824c-2.0736 10.4192-14.592 20.864-25.0368 20.864H30.1568c-12.544 0-14.592-6.272-12.544-10.4448 0 0 0 2.0992 0 0z m878.1824 200.2688c2.0736-4.1728 0-2.0992 0 0 2.0736-12.544 12.5184-22.9632 25.0112-22.9632h56.32c10.4448 0 16.6912 8.3456 14.592 18.7904l-12.4928 37.5296c-6.272 12.544-16.6912 18.7904-29.184 18.7904l-48-6.272c-10.4192-2.0736-16.6912-10.4192-14.592-22.9376 0 0 8.3456-18.7648 8.3456-22.9376z" />
  </svg>
);

const MemberSection = ({
  members,
  balances,
  teaFeeTotal,
  currentUserId,
  onQuickTransfer,
}: MemberSectionProps) => {
  return (
    <div className="flex flex-col gap-1.5 mb-5">
      {members.map((m) => {
        const isMe = m.userId === currentUserId;
        const bal = balances.find((b) => b.userId === m.userId);
        return (
          <div
            key={m.userId}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{
              backgroundColor: 'rgba(255,255,255,0.10)',
              border: isMe
                ? '2px solid #d4af37'
                : '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <Avatar userId={m.userId} name={m.userName} />
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="text-sm font-semibold truncate"
                style={{ color: '#f0f0e8' }}
                title={m.userName}
              >
                {m.userName}
              </span>
              {isMe && (
                <span
                  className="text-[10px] px-1 py-px rounded shrink-0"
                  style={{
                    backgroundColor: 'rgba(212,175,55,0.18)',
                    color: '#e8c96a',
                  }}
                >
                  我
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-sm" style={{ color: '#c9c9bc' }}>
                {fmtBalance(bal ? bal.balance : '0')}
              </span>
              {!isMe && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6 [&_svg]:size-3"
                  style={{
                    color: '#d4af37',
                    borderColor: 'rgba(212,175,55,0.4)',
                  }}
                  onClick={() => onQuickTransfer(m.userId)}
                  aria-label="转账"
                  title={`向 ${m.userName} 转账`}
                >
                  {TRANSFER_SVG}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* 茶水费虚拟成员 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{
          backgroundColor: 'rgba(212,175,55,0.12)',
          border: '1px solid rgba(212,175,55,0.35)',
        }}
      >
        <span
          className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: '#d4af37', color: '#07301a' }}
          aria-hidden="true"
        >
          ¥
        </span>
        <span className="text-sm font-semibold" style={{ color: '#e8c96a' }}>
          茶水费
        </span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-sm" style={{ color: '#e8c96a' }}>
            {fmtBalance(teaFeeTotal)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 [&_svg]:size-3"
            style={{
              color: '#e8c96a',
              borderColor: 'rgba(212,175,55,0.4)',
            }}
            onClick={() => onQuickTransfer('tea_fee')}
            aria-label="转账到茶水费"
            title="向茶水费转账"
          >
            {TRANSFER_SVG}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MemberSection;
