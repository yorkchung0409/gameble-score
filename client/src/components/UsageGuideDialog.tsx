import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface UsageGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

const GuideSection = ({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) => (
  <div className="mb-4">
    <div
      className="text-sm font-semibold mb-1.5"
      style={{ color }}
    >
      {title}
    </div>
    <ul className="space-y-1.5">
      {items.map((it, idx) => (
        <li
          key={idx}
          className="text-sm leading-relaxed flex gap-1.5"
          style={{ color: '#222B26' }}
        >
          <span style={{ color: '#B08D1E' }}>·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);

const UsageGuideDialog = ({ open, onClose }: UsageGuideDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[90vw] max-w-[420px] rounded-2xl p-0 overflow-hidden"
        style={{ border: '1px solid #E6EAE2', background: '#FFFFFF' }}
      >
        <DialogHeader
          className="px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid #E6EAE2' }}
        >
          <DialogTitle
            className="text-base font-semibold"
            style={{ color: '#222B26' }}
          >
            使用说明
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <GuideSection
            title="麻将"
            color="#1E7A46"
            items={[
              '进入房间即成为成员，点头像即可互相转账；',
              '「茶水费」是虚拟账户，用于收取茶位费；',
              '房主可切换「普通模式」（进房即转）与「坐下模式」（需入座东南西北四个位置才能转账）；',
              '普通模式换坐下模式需玩家自行入座，坐下模式换回普通模式需全部离座；',
              '转错账可冲正，仅能冲正自己付款的记录；',
              '房间超过 30 分钟无转账会自动解散，账目归档保留；',
              '退出房间仅退出本局，可随时再次进入，历史余额自动接上。',
            ]}
          />
          <GuideSection
            title="德州"
            color="#1E7A46"
            items={[
              '账本号 = 独立记账本，不同局、不同人可分账本记录；',
              '新建牌局记录每位玩家的买入、结余，系统自动计算净盈亏；',
              '保存后仅展示日期、人数与流水，点击可展开明细。',
            ]}
          />
          <GuideSection
            title="通用"
            color="#B08D1E"
            items={[
              '数据保存在云端，多人可实时协作；',
              '换设备使用同一账号即可同步数据；',
              '麻将的「最近进入」保留最近 3 条记录。',
            ]}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UsageGuideDialog;
