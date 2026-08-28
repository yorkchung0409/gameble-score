import { useState, useEffect, useCallback } from 'react';

const DEVICE_ID_KEY = 'mahjong_device_id';
const USER_KEY = 'mahjong_user';

export interface MahjongUser {
  id: string;
  name: string;
}

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

export function useMahjongUser(): {
  deviceId: string;
  currentUser: MahjongUser | null;
  setCurrentUser: (user: MahjongUser | null) => void;
} {
  const [deviceId, setDeviceId] = useState<string>('');
  const [currentUser, setCurrentUserState] = useState<MahjongUser | null>(null);

  useEffect(() => {
    // 读取设备ID
    let storedDeviceId: string | null = null;
    try {
      storedDeviceId = window.localStorage.getItem(DEVICE_ID_KEY);
    } catch {
      // localStorage 不可用时忽略
    }

    if (!storedDeviceId) {
      const newId: string = generateDeviceId();
      try {
        window.localStorage.setItem(DEVICE_ID_KEY, newId);
      } catch {
        // 忽略写入失败
      }
      setDeviceId(newId);
    } else {
      setDeviceId(storedDeviceId);
    }

    // 读取用户信息
    try {
      const storedUser: string | null = window.localStorage.getItem(USER_KEY);
      if (storedUser) {
        const parsed: MahjongUser = JSON.parse(storedUser) as MahjongUser;
        if (parsed && parsed.id && parsed.name) {
          setCurrentUserState(parsed);
        }
      }
    } catch {
      // JSON 解析失败或 localStorage 不可用时忽略
    }
  }, []);

  const setCurrentUser = useCallback((user: MahjongUser | null) => {
    setCurrentUserState(user);
    try {
      if (user) {
        window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(USER_KEY);
      }
    } catch {
      // 忽略写入失败
    }
  }, []);

  return { deviceId, currentUser, setCurrentUser };
}
