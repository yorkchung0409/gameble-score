import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomVisitsApi } from '@client/src/api';
import { Clock, ChevronRight } from 'lucide-react';
import type { RoomVisitRecord } from '@shared/api.interface';

interface RecentRoomsProps {
  deviceId: string;
  gameType: string;
  pathPrefix: string;
  /** 无记录时显示的空态文案；不传则不显示任何内容 */
  emptyText?: string;
}

const RecentRooms = ({
  deviceId,
  gameType,
  pathPrefix,
  emptyText,
}: RecentRoomsProps) => {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<RoomVisitRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await roomVisitsApi.getVisits(deviceId, gameType, 5);
        if (!cancelled) {
          setVisits(res.visits);
        }
      } catch {
        // 忽略失败，不显示历史
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, gameType]);

  if (loading) return null;

  if (visits.length === 0) {
    if (!emptyText) return null;
    return (
      <div
        className="rounded-xl p-6 text-center shadow-lg mb-4"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          color: '#b8b8a8',
        }}
      >
        {emptyText}
      </div>
    );
  }

  const formatTime = (isoStr: string): string => {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  };

  return (
    <div
      className="rounded-xl p-4 shadow-lg mb-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(212,175,55,0.3)',
        boxShadow: '0 4px 20px rgba(212,175,55,0.15)',
      }}
    >
      <div
        className="flex items-center gap-2 mb-3"
        style={{ color: '#e8c96a' }}
      >
        <Clock className="w-4 h-4" />
        <span className="text-sm font-semibold">最近进入</span>
      </div>
      <div className="flex flex-col gap-2">
        {visits.map((v: RoomVisitRecord) => (
          <div
            key={v.id}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => navigate(`${pathPrefix}${v.roomCode}`)}
          >
            <div className="flex flex-col min-w-0">
              <span
                className="text-sm font-medium truncate"
                style={{ color: '#f0f0e8' }}
              >
                {v.roomName}
              </span>
              <span
                className="text-xs mt-0.5"
                style={{ color: '#b8b8a8' }}
              >
                房间号：{v.roomCode}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="text-xs"
                style={{ color: '#b8b8a8' }}
              >
                {formatTime(v.lastVisitedAt)}
              </span>
              <ChevronRight
                className="w-4 h-4"
                style={{ color: '#b8b8a8' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentRooms;
