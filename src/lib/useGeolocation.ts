import { useEffect, useState } from 'react';
export function useGeolocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');

  useEffect(() => {
    if (!navigator.geolocation) { setStatus('denied'); return; }
    setStatus('loading');
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  return { position, status };
}

