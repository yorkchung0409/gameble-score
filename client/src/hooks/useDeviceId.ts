import { useState, useEffect } from 'react';

const DEVICE_ID_KEY = 'poker_device_id';

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

export function useDeviceId(): string {
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DEVICE_ID_KEY);
    } catch {
      // ignore
    }
    if (!stored) {
      const newId: string = generateDeviceId();
      try {
        window.localStorage.setItem(DEVICE_ID_KEY, newId);
      } catch {
        // ignore
      }
      setDeviceId(newId);
    } else {
      setDeviceId(stored);
    }
  }, []);

  return deviceId;
}
