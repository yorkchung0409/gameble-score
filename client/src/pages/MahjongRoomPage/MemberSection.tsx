import type { MahjongRoomMember } from '@shared/api.interface';

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
      className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
      style={{ backgroundColor: avatarColor(userId), color: '#fff' }}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
}

// 可点击头像：点击即发起转账
function AvatarButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="点击头像转账"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full transition-transform active:scale-95"
      style={disabled ? { cursor: 'default' } : { cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

const MemberSection = ({
  members,
  balances,
  teaFeeTotal,
  currentUserId,
  onQuickTransfer,
}: MemberSectionProps) => {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 mb-5">
      {members.map((m) => {
        const isMe = m.userId === currentUserId;
        const bal = balances.find((b) => b.userId === m.userId);
        return (
          <div key={m.userId} className="flex flex-col items-center gap-1 w-[68px] shrink-0">
            <div className="relative">
              <AvatarButton
                label={isMe ? undefined : `向 ${m.userName} 转账`}
                disabled={isMe}
                onClick={() => !isMe && onQuickTransfer(m.userId)}
              >
                <Avatar userId={m.userId} name={m.userName} />
              </AvatarButton>
              {isMe && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[9px] px-1 py-px rounded-full font-bold"
                  style={{ backgroundColor: '#d4af37', color: '#07301a' }}
                >
                  我
                </span>
              )}
            </div>
            <span
              className="text-[11px] w-full text-center truncate"
              style={{ color: '#f0f0e8' }}
              title={m.userName}
            >
              {m.userName}
            </span>
            <span className="text-xs font-medium" style={{ color: '#c9c9bc' }}>
              {fmtBalance(bal ? bal.balance : '0')}
            </span>
          </div>
        );
      })}

      {/* 茶水费虚拟成员 */}
      <div className="flex flex-col items-center gap-1 w-[68px] shrink-0">
        <div className="relative">
          <AvatarButton label="向茶水费转账" onClick={() => onQuickTransfer('tea_fee')}>
            <span
              className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
              style={{ backgroundColor: '#d4af37', color: '#07301a' }}
              aria-hidden="true"
            >
              ¥
            </span>
          </AvatarButton>
        </div>
        <span className="text-[11px] w-full text-center truncate" style={{ color: '#e8c96a' }}>
          茶水费
        </span>
        <span className="text-xs font-medium" style={{ color: '#e8c96a' }}>
          {fmtBalance(teaFeeTotal)}
        </span>
      </div>
    </div>
  );
};

export default MemberSection;
