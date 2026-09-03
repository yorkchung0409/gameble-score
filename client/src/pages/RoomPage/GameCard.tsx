import { useState } from 'react';
import { Pencil, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import type { Game } from '@shared/api.interface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Button } from '@client/src/components/ui/button';

interface GameCardProps {
  game: Game;
  onEdit: (game: Game) => void;
  onDelete: (gameId: string) => void;
}

const formatAmount = (val: string): string => Number(val).toFixed(2);
// 金额按分取整，避免浮点误差
const fmtNum = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

const netProfitColor = (net: string): string => {
  const n = Number(net);
  if (n > 0) return '#ef4444'; // red - win
  if (n < 0) return '#22c55e'; // green - lose
  return '#9ca3af'; // gray
};

const GameCard = ({ game, onEdit, onDelete }: GameCardProps) => {
  // 默认折叠：折叠时只显示 日期 / 人数 / 流水
  const [expanded, setExpanded] = useState(false);

  // 零和校验：赢流水=赢家净盈亏之和；输流水=输家净盈亏绝对值之和；差额理论应为 0
  let winSum = 0;
  let lossSum = 0;
  for (const pl of game.players) {
    const np = Number(pl.netProfit);
    if (np > 0) winSum += np;
    else if (np < 0) lossSum += -np;
  }
  winSum = Math.round(winSum * 100) / 100;
  lossSum = Math.round(lossSum * 100) / 100;
  const diff = Math.round((winSum - lossSum) * 100) / 100;
  const balanced = Math.abs(diff) < 0.005;

  const handleDelete = async () => {
    if (window.confirm('确定删除这条牌局记录吗？')) {
      onDelete(game.id);
    }
  };

  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      {/* 概要行（点击展开/折叠） */}
      <div
        className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-base font-semibold whitespace-nowrap"
            style={{ color: '#f0f0e8' }}
          >
            {game.gameDate}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.25)',
              color: '#f2f2ea',
            }}
          >
            <Users className="w-3 h-3" />
            {game.playerCount}人
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-mono whitespace-nowrap" style={{ color: '#c9c9bc' }}>
            流水
            <span
              className="ml-1 font-semibold"
              style={{ color: balanced ? '#f0f0e8' : '#ef4444' }}
            >
              ¥{fmtNum(winSum)}
            </span>
          </span>
          {!balanced && (
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >
              未平 ¥{fmtNum(Math.abs(diff))}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#c9c9bc]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#c9c9bc]" />
          )}
        </div>
      </div>

      {/* 展开内容：总买入 + 操作 + 明细表 + 零和校验 */}
      {expanded && (
        <>
          <div className="flex items-center justify-between gap-2 mt-3">
            <div className="text-sm font-mono" style={{ color: '#c9c9bc' }}>
              总买入 ¥{formatAmount(game.totalBuyIn)}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#c9c9bc] hover:text-[#f0f0e8]"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(game);
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[#c9c9bc] hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="mt-2">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[rgba(255_255_255_0.15)] hover:bg-transparent">
                  <TableHead className="text-[#c9c9bc] font-normal">人员</TableHead>
                  <TableHead className="text-right text-[#c9c9bc] font-normal font-mono">
                    买入
                  </TableHead>
                  <TableHead className="text-right text-[#c9c9bc] font-normal font-mono">
                    结余
                  </TableHead>
                  <TableHead className="text-right text-[#c9c9bc] font-normal font-mono">
                    净盈亏
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {game.players.map((pl) => (
                  <TableRow
                    key={pl.id}
                    className="border-b border-[rgba(255_255_255_0.05)] hover:bg-[rgba(255_255_255_0.03)]"
                  >
                    <TableCell style={{ color: '#f0f0e8' }}>{pl.playerName}</TableCell>
                    <TableCell
                      className="text-right font-mono"
                      style={{ color: '#f0f0e8' }}
                    >
                      {formatAmount(pl.buyIn)}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono"
                      style={{ color: '#f0f0e8' }}
                    >
                      {formatAmount(pl.balance)}
                    </TableCell>
                    <TableCell
                      className="text-right font-mono font-semibold"
                      style={{ color: netProfitColor(pl.netProfit) }}
                    >
                      {Number(pl.netProfit) >= 0 ? '+' : ''}
                      {formatAmount(pl.netProfit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 零和校验行 */}
            <div
              className="flex items-center justify-end gap-3 mt-2 text-xs font-mono"
              style={{ color: '#c9c9bc' }}
            >
              <span>赢 ¥{fmtNum(winSum)}</span>
              <span>输 ¥{fmtNum(lossSum)}</span>
              <span style={{ color: balanced ? '#22c55e' : '#ef4444' }}>
                {balanced ? '已平衡' : `差额 ¥${fmtNum(Math.abs(diff))}`}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GameCard;
