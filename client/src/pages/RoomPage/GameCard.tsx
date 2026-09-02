import { Pencil, Trash2, Users } from 'lucide-react';
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

const netProfitColor = (net: string): string => {
  const n = Number(net);
  if (n > 0) return '#ef4444'; // red - win
  if (n < 0) return '#22c55e'; // green - lose
  return '#9ca3af'; // gray
};

const GameCard = ({ game, onEdit, onDelete }: GameCardProps) => {
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
        boxShadow: '0 4px 20px rgba(212,175,55,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold" style={{ color: '#f0f0e8' }}>
            {game.gameDate}
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
            style={{
              backgroundColor: 'rgba(0,0,0,0.25)',
              color: '#e8c96a',
            }}
          >
            <Users className="w-3 h-3" />
            {game.playerCount}人
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono font-semibold"
            style={{ color: '#e8c96a' }}
          >
            总买入 ¥{formatAmount(game.totalBuyIn)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#c9c9bc] hover:text-[#f0f0e8]"
              onClick={() => onEdit(game)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#c9c9bc] hover:text-red-400"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[rgba(212_175_55_0.15)] hover:bg-transparent">
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
          {game.players.map((p) => (
            <TableRow
              key={p.id}
              className="border-b border-[rgba(255_255_255_0.05)] hover:bg-[rgba(255_255_255_0.03)]"
            >
              <TableCell style={{ color: '#f0f0e8' }}>{p.playerName}</TableCell>
              <TableCell
                className="text-right font-mono"
                style={{ color: '#f0f0e8' }}
              >
                {formatAmount(p.buyIn)}
              </TableCell>
              <TableCell
                className="text-right font-mono"
                style={{ color: '#f0f0e8' }}
              >
                {formatAmount(p.balance)}
              </TableCell>
              <TableCell
                className="text-right font-mono font-semibold"
                style={{ color: netProfitColor(p.netProfit) }}
              >
                {Number(p.netProfit) >= 0 ? '+' : ''}
                {formatAmount(p.netProfit)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default GameCard;
