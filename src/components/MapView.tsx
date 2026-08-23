import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Crosshair, Loader2, Car, Users } from 'lucide-react';
import type { Trip } from '@/lib/supabase';

function createIcon(role: 'driver' | 'passenger', active: boolean) {
  const color = role === 'driver' ? '#2563eb' : '#059669';
  const size = active ? 36 : 28;
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function createUserIcon() {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 0 0 4px rgba(220,38,38,0.25),0 2px 6px rgba(0,0,0,0.3);"></div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export interface MapMarker {
  trip: Trip;
  lat: number;
  lng: number;
  label: string;
  isFrom: boolean;
}

export function MapView({
  markers,
  userPos,
  onTripClick,
}: {
  markers: MapMarker[];
  userPos: { lat: number; lng: number } | null;
  onTripClick?: (trip: Trip) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([54.6872, 25.2797], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    markerLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  const onTripClickRef = useRef(onTripClick);

  useEffect(() => { onTripClickRef.current = onTripClick; }, [onTripClick]);

  useEffect(() => {
    if (!mapInstance.current || !markerLayer.current) return;
    markerLayer.current.clearLayers();
    const bounds: [number, number][] = [];
    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: createIcon(m.trip.role, false) }).addTo(markerLayer.current!);
      const popup = document.createElement('div');
      popup.style.minWidth = '160px';
      const title = document.createElement('div');
      title.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:4px;';
      title.textContent = m.trip.role === 'driver' ? '🚗 Vairuotojas' : '👤 Keleivis';
      const label = document.createElement('div');
      label.style.cssText = 'font-size:13px;color:#475569;';
      label.textContent = m.label;
      const route = document.createElement('div');
      route.style.cssText = 'font-size:12px;color:#64748b;margin-top:4px;';
      route.textContent = `${m.trip.from_location} → ${m.trip.to_location}`;
      popup.append(title, label, route);
      marker.bindPopup(popup);
      marker.on('click', () => onTripClickRef.current?.(m.trip));
      bounds.push([m.lat, m.lng]);
    });
    if (bounds.length > 0) mapInstance.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50], maxZoom: 14 });
  }, [markers]);

  useEffect(() => {
    if (!mapInstance.current) return;
    if (!userPos) { userMarker.current?.remove(); userMarker.current = null; return; }
    if (userMarker.current) userMarker.current.setLatLng([userPos.lat, userPos.lng]);
    else userMarker.current = L.marker([userPos.lat, userPos.lng], { icon: createUserIcon() }).addTo(mapInstance.current).bindPopup('<div style=\"font-weight:600;font-size:13px;\">Jūsų pozicija</div>');
  }, [userPos]);

  function locateUser() {
    if (userPos && mapInstance.current) {
      mapInstance.current.setView([userPos.lat, userPos.lng], 14, { animate: true });
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (mapInstance.current) {
          mapInstance.current.setView([latitude, longitude], 13);
        }
        setLocating(false);
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? 'Vietos nustatymas atmestas. Leiskite prieigą prie vietos.'
            : 'Nepavyko nustatyti vietos. Bandykite dar kartą.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden border border-slate-200 shadow-sm z-0"
      />
      <button
        onClick={locateUser}
        disabled={locating}
        className="absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white text-slate-700 text-sm font-semibold shadow-lg border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60"
      >
        {locating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Crosshair className="w-4 h-4 text-blue-500" />
        )}
        <span className="hidden sm:inline">Mano vieta</span>
      </button>
      {gpsError && (
        <div className="absolute top-3 left-3 right-3 z-[1000] bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 text-center">
          {gpsError}
        </div>
      )}
      {markers.length === 0 && !userPos && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur rounded-xl px-3 py-2 text-xs text-slate-500 flex items-center gap-1.5 shadow-sm">
          <MapPin className="w-3.5 h-3.5" />
          Žemėlapyje matysis visi skelbimai su koordinatėmis
        </div>
      )}
    </div>
  );
}

export function useGeolocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('denied');
      return;
    }
    setStatus('loading');
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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

export { Car, Users };
