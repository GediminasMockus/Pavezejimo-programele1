import { mapPopup } from '@/lib/mapPopup';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Route as RouteIcon, Loader2 } from 'lucide-react';
import type { Trip, RideRequest } from '@/lib/supabase';
import { formatDistance } from '@/lib/distance';
import { formatDateTime } from '@/lib/format';
import { fetchDrivingRoute, type DrivingRoute, type RoutePoint } from '@/lib/routing';

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
    driverRoute?: DrivingRoute | null;
    passengerRoute?: DrivingRoute | null;
    fullRoute?: DrivingRoute | null;
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

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    observer.observe(mapRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const controller = new AbortController();

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    async function buildRoute() {
      setLoading(true);
      const points: [number, number][] = [];

      const driverPoints: RoutePoint[] | null = hasDriverCoords
        ? [[trip.from_lat!, trip.from_lng!], [trip.to_lat!, trip.to_lng!]]
        : null;
      const passengerPoints: RoutePoint[] | null = hasRequestCoords
        ? [[request!.pickup_lat!, request!.pickup_lng!], [request!.dropoff_lat!, request!.dropoff_lng!]]
        : null;
      const fullPoints: RoutePoint[] | null = hasDriverCoords && hasRequestCoords
        ? [
            [trip.from_lat!, trip.from_lng!],
            [request!.pickup_lat!, request!.pickup_lng!],
            [request!.dropoff_lat!, request!.dropoff_lng!],
            [trip.to_lat!, trip.to_lng!],
          ]
        : null;

      const [driverRouteData, passengerRouteData, fullRouteData] = await Promise.all([
        driverPoints ? fetchDrivingRoute(driverPoints, controller.signal) : Promise.resolve(null),
        passengerPoints ? fetchDrivingRoute(passengerPoints, controller.signal) : Promise.resolve(null),
        fullPoints ? fetchDrivingRoute(fullPoints, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;

      if (hasDriverCoords) {
        L.marker([trip.from_lat!, trip.from_lng!], { icon: bluePin('Iš') })
          .addTo(map)
          .bindPopup(mapPopup('Išvykimas', trip.from_location));
        L.marker([trip.to_lat!, trip.to_lng!], { icon: bluePin('Į') })
          .addTo(map)
          .bindPopup(mapPopup('Atvykimas', trip.to_location));

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

      let detour: number | undefined;
      if (hasDriverCoords && hasRequestCoords) {
        L.marker([request!.pickup_lat!, request!.pickup_lng!], { icon: greenPin('A') })
          .addTo(map)
          .bindPopup(mapPopup('Keleivio paėmimas', request!.pickup_location));
        L.marker([request!.dropoff_lat!, request!.dropoff_lng!], { icon: greenPin('B') })
          .addTo(map)
          .bindPopup(mapPopup('Keleivio išlaipinimas', request!.dropoff_location));

        if (fullRouteData) {
          L.polyline(fullRouteData.coordinates, {
            color: '#059669',
            weight: 5,
            opacity: 0.85,
          }).addTo(map);
        } else {
          L.polyline(
            [
              [trip.from_lat!, trip.from_lng!],
              [request!.pickup_lat!, request!.pickup_lng!],
              [request!.dropoff_lat!, request!.dropoff_lng!],
              [trip.to_lat!, trip.to_lng!],
            ],
            { color: '#059669', weight: 5, opacity: 0.85 },
          ).addTo(map);
        }

        points.push([request!.pickup_lat!, request!.pickup_lng!]);
        points.push([request!.dropoff_lat!, request!.dropoff_lng!]);

        if (driverRouteData && fullRouteData) {
          detour = Math.max(0, fullRouteData.distance - driverRouteData.distance);
        }
      }

      if (points.length > 0) {
        map.fitBounds(points as L.LatLngBoundsExpression, { padding: [60, 60], maxZoom: 14 });
      }

      setRouteInfo({
        driverRoute: driverRouteData,
        passengerRoute: passengerRouteData,
        fullRoute: fullRouteData,
        detour,
      });
      setLoading(false);
    }

    void buildRoute();
    return () => controller.abort();
  }, [trip, request, hasDriverCoords, hasRequestCoords]);

  const driverDist = routeInfo.driverRoute?.distance ?? null;
  const passengerDist = routeInfo.passengerRoute?.distance ?? null;
  const fullDist = routeInfo.fullRoute?.distance ?? null;
  const routingFailed = !loading && hasDriverCoords && !routeInfo.driverRoute;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4">
      <div className="w-full h-[100dvh] sm:h-[min(92dvh,900px)] sm:max-w-3xl bg-white sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 bg-white/95 backdrop-blur px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Maršruto peržiūra</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {trip.from_location} → {trip.to_location} · {formatDateTime(trip.departure_time)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
            aria-label="Uždaryti maršruto peržiūrą"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <div className="relative w-full h-[48dvh] min-h-[280px] max-h-[560px] sm:h-[52dvh] sm:min-h-[360px] sm:max-h-[620px] rounded-2xl overflow-hidden border border-slate-200">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-[500]">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>

          <div className="mt-4 space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            {hasDriverCoords && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900 mb-1">
                  <span className="w-4 h-1 rounded bg-blue-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #2563eb 0 6px, transparent 6px 12px)' }} />
                  Tiesioginis vairuotojo maršrutas
                </div>
                <div className="text-sm text-blue-800">
                  {trip.from_location} → {trip.to_location}
                </div>
                {driverDist !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-blue-700 mt-1">
                    <RouteIcon className="w-3.5 h-3.5" />
                    {formatDistance(driverDist)}
                  </div>
                )}
              </div>
            )}

            {hasRequestCoords && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900 mb-1">
                  <span className="w-4 h-1 rounded bg-emerald-500" />
                  Keleivio atkarpa
                </div>
                <div className="text-sm text-emerald-800">
                  {request!.pickup_location} → {request!.dropoff_location}
                </div>
                {passengerDist !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-700 mt-1">
                    <RouteIcon className="w-3.5 h-3.5" />
                    {formatDistance(passengerDist)}
                  </div>
                )}
              </div>
            )}

            {hasDriverCoords && hasRequestCoords && fullDist !== null && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-teal-900">
                  <span className="h-1 w-4 rounded bg-teal-600" />
                  Visas patvirtintas maršrutas
                </div>
                <div className="text-sm text-teal-800">
                  Vairuotojo pradžia → keleivio paėmimas → keleivio išlaipinimas → vairuotojo tikslas
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal-700">
                  <RouteIcon className="h-3.5 w-3.5" />
                  {formatDistance(fullDist)}
                </div>
              </div>
            )}

            {routeInfo.detour !== undefined && routeInfo.detour > 0 && (
              <div className={`rounded-xl p-3 text-sm ${
                routeInfo.detour < 5
                  ? 'bg-amber-50 border border-amber-200 text-amber-700'
                  : routeInfo.detour < 15
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="w-4 h-4" />
                  Papildomai vairuotojui: +{formatDistance(routeInfo.detour)}
                </div>
              </div>
            )}

            {routingFailed && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
                Kelio atstumo apskaičiuoti nepavyko. Tiesios linijos kilometrai nerodomi, nes jie neatitiktų realaus važiavimo.
              </p>
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
