import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Route as RouteIcon, Loader2 } from 'lucide-react';
import type { Trip, RideRequest } from '@/lib/supabase';
import { haversineDistance, formatDistance, calculateDetour } from '@/lib/distance';
import { formatDateTime } from '@/lib/format';

interface RouteData {
  coordinates: [number, number][];
  distance: number;
}

async function fetchRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<RouteData | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.routes || !json.routes[0]) return null;
    const coords: [number, number][] = json.routes[0].geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]],
    );
    const distance = json.routes[0].distance / 1000;
    return { coordinates: coords, distance };
  } catch {
    return null;
  }
}

export function RoutePreviewModal({
  trip,
  request,
  onClose,
}: {
  trip: Trip;
  request?: RideRequest | null;
  onClose: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeInfo, setRouteInfo] = useState<{
    driverRoute?: RouteData | null;
    fullRoute?: RouteData | null;
    detour?: number;
  }>({});

  const hasDriverCoords =
    trip.from_lat !== null && trip.from_lng !== null && trip.to_lat !== null && trip.to_lng !== null;
  const hasRequestCoords =
    request &&
    request.pickup_lat !== null &&
    request.pickup_lng !== null &&
    request.dropoff_lat !== null &&
    request.dropoff_lng !== null;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([54.6872, 25.2797], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    // Clear previous layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    async function buildRoute() {
      setLoading(true);
      const points: [number, number][] = [];

      // Driver route (dashed blue)
      let driverRouteData: RouteData | null = null;
      if (hasDriverCoords) {
        L.marker([trip.from_lat!, trip.from_lng!], { icon: bluePin('Iš') })
          .addTo(map)
          .bindPopup(`<b>Išvykimas</b><br/>${trip.from_location}`);
        L.marker([trip.to_lat!, trip.to_lng!], { icon: bluePin('Į') })
          .addTo(map)
          .bindPopup(`<b>Atvykimas</b><br/>${trip.to_location}`);

        driverRouteData = await fetchRoute(trip.from_lat!, trip.from_lng!, trip.to_lat!, trip.to_lng!);
        if (driverRouteData) {
          L.polyline(driverRouteData.coordinates, {
            color: '#2563eb',
            weight: 4,
            opacity: 0.5,
            dashArray: '10 8',
          }).addTo(map);
        } else {
          L.polyline(
            [[trip.from_lat!, trip.from_lng!], [trip.to_lat!, trip.to_lng!]],
            { color: '#2563eb', weight: 4, opacity: 0.5, dashArray: '10 8' },
          ).addTo(map);
        }

        points.push([trip.from_lat!, trip.from_lng!]);
        points.push([trip.to_lat!, trip.to_lng!]);
      }

      // Full route with passenger (solid green)
      let fullRouteData: RouteData | null = null;
      let detour: number | undefined;
      if (hasDriverCoords && hasRequestCoords) {
        L.marker([request!.pickup_lat!, request!.pickup_lng!], { icon: greenPin('A') })
          .addTo(map)
          .bindPopup(`<b>Keleivio paėmimas</b><br/>${request!.pickup_location}`);
        L.marker([request!.dropoff_lat!, request!.dropoff_lng!], { icon: greenPin('B') })
          .addTo(map)
          .bindPopup(`<b>Keleivio išlaipinimas</b><br/>${request!.dropoff_location}`);

        // Fetch all three legs of the route
        const [leg1, leg2, leg3] = await Promise.all([
          fetchRoute(trip.from_lat!, trip.from_lng!, request!.pickup_lat, request!.pickup_lng),
          fetchRoute(request!.pickup_lat, request!.pickup_lng, request!.dropoff_lat, request!.dropoff_lng),
          fetchRoute(request!.dropoff_lat, request!.dropoff_lng, trip.to_lat!, trip.to_lng!),
        ]);

        const allCoords: [number, number][] = [];
        let totalDist = 0;
        for (const leg of [leg1, leg2, leg3]) {
          if (leg) {
            allCoords.push(...leg.coordinates);
            totalDist += leg.distance;
          }
        }

        if (allCoords.length > 0) {
          fullRouteData = { coordinates: allCoords, distance: totalDist };
          L.polyline(allCoords, {
            color: '#059669',
            weight: 5,
            opacity: 0.85,
          }).addTo(map);
        } else {
          // Fallback to straight lines
          L.polyline(
            [
              [trip.from_lat!, trip.from_lng!],
              [request!.pickup_lat, request!.pickup_lng],
              [request!.dropoff_lat, request!.dropoff_lng],
              [trip.to_lat!, trip.to_lng!],
            ],
            { color: '#059669', weight: 5, opacity: 0.85 },
          ).addTo(map);
        }

        points.push([request!.pickup_lat, request!.pickup_lng]);
        points.push([request!.dropoff_lat, request!.dropoff_lng]);

        const driverDist = driverRouteData?.distance ?? haversineDistance(trip.from_lat!, trip.from_lng!, trip.to_lat!, trip.to_lng!);
        detour = Math.max(0, totalDist - driverDist);
      }

      if (points.length > 0) {
        map.fitBounds(points as L.LatLngBoundsExpression, { padding: [60, 60], maxZoom: 14 });
      }

      setRouteInfo({
        driverRoute: driverRouteData,
        fullRoute: fullRouteData,
        detour,
      });
      setLoading(false);
    }

    buildRoute();
  }, [trip, request]);

  const driverDist = routeInfo.driverRoute?.distance ?? (hasDriverCoords ? haversineDistance(trip.from_lat!, trip.from_lng!, trip.to_lat!, trip.to_lng!) : null);
  const fullDist = routeInfo.fullRoute?.distance ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Maršruto peržiūra</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {trip.from_location} → {trip.to_location} · {formatDateTime(trip.departure_time)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="relative w-full h-[300px] sm:h-[350px] rounded-2xl overflow-hidden border border-slate-200">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-[500]">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-1 rounded bg-blue-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #2563eb 0 6px, transparent 6px 12px)' }} />
                <span className="text-slate-600">Vairuotojo maršrutas</span>
              </span>
              {hasRequestCoords && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-1 rounded bg-emerald-500" />
                  <span className="text-slate-600">Su keleiviu</span>
                </span>
              )}
            </div>

            {driverDist !== null && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <RouteIcon className="w-4 h-4 text-slate-400" />
                Vairuotojo atstumas: {formatDistance(driverDist)}
              </div>
            )}

            {fullDist !== null && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <RouteIcon className="w-4 h-4 text-emerald-500" />
                Pilnas maršrutas su keleiviu: {formatDistance(fullDist)}
              </div>
            )}

            {routeInfo.detour !== undefined && routeInfo.detour > 0 && (
              <div className={`rounded-xl p-3 text-sm ${
                routeInfo.detour < 5
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : routeInfo.detour < 15
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="w-4 h-4" />
                  Papildomas nuokrypis: +{formatDistance(routeInfo.detour)}
                </div>
                <p className="mt-0.5">
                  {driverDist !== null && `Iš ${formatDistance(driverDist)} → ${formatDistance(fullDist ?? 0)}`}
                </p>
              </div>
            )}

            {!hasDriverCoords && (
              <p className="text-sm text-slate-400">
                Vairuotojas nenurodė tikslių koordinačių, todėl maršrutas žemėlapyje nerodomas.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function bluePin(label: string): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${label}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
}

function greenPin(label: string): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:#059669;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${label}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
}
