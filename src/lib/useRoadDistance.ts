import { useEffect, useRef, useState } from 'react';
import { fetchDrivingDistance, type RoutePoint } from './routing';

type DistanceResult = { key: string; km: number | null };

export function useRoadDistance<T extends HTMLElement = HTMLDivElement>(fromLat: number | null, fromLng: number | null, toLat: number | null, toLng: number | null) {
  const ref = useRef<T>(null);
  const valid = [fromLat, fromLng, toLat, toLng].every(value => value !== null && Number.isFinite(value));
  const key = valid ? `${fromLat},${fromLng};${toLat},${toLng}` : '';
  const [visibleKey, setVisibleKey] = useState('');
  const [result, setResult] = useState<DistanceResult | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!key || !element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleKey(key);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisibleKey(key);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [key]);

  useEffect(() => {
    if (!key || visibleKey !== key) return;
    let cancelled = false;
    const points: RoutePoint[] = [[fromLat!, fromLng!], [toLat!, toLng!]];
    void fetchDrivingDistance(points).then(km => {
      if (!cancelled) setResult({ key, km });
    });
    return () => { cancelled = true; };
  }, [key, visibleKey, fromLat, fromLng, toLat, toLng]);

  return { ref, distanceKm: result?.key === key ? result.km : undefined };
}
