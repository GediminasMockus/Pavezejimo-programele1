import { useDialogFocus } from '@/lib/useDialogFocus';
import { mapPopup } from '@/lib/mapPopup';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { X, MapPin, Route as RouteIcon, Loader2 } from 'lucide-react';
import type { Trip, RideRequest } from '@/lib/supabase';
import { formatDistance } from '@/lib/distance';
import { formatDateTime } from '@/lib/format';
import { fetchDrivingRoute, fetchDrivingRouteWithLegs, type DrivingRoute, type RoutePoint } from '@/lib/routing';

const driverLineColor = '#227b80';
const combinedLineColor = '#7766a5';

export function RoutePreviewModal({
  trip,
  request,
  onClose,
}: {
  trip: Trip;
  request?: RideRequest | null;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus();

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
  const directLineColor = trip.role === 'driver' || hasRequestCoords ? driverLineColor : combinedLineColor;

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
      const fullPoints: RoutePoint[] | null = hasDriverCoords && hasRequestCoords
        ? [
            [trip.from_lat!, trip.from_lng!],
            [request!.pickup_lat!, request!.pickup_lng!],
            [request!.dropoff_lat!, request!.dropoff_lng!],
            [trip.to_lat!, trip.to_lng!],
          ]
        : null;

      const [driverRouteData, fullRouteData] = await Promise.all([
        driverPoints ? fetchDrivingRoute(driverPoints, controller.signal) : Promise.resolve(null),
        fullPoints ? fetchDrivingRouteWithLegs(fullPoints, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      const [beforePickup, withPassenger, afterDropoff] = fullRouteData?.legs ?? [];

      if (hasDriverCoords) {
        L.marker([trip.from_lat!, trip.from_lng!], { icon: tripPin('Iš', directLineColor) })
          .addTo(map)
          .bindPopup(mapPopup('Išvykimas', trip.from_location));
        L.marker([trip.to_lat!, trip.to_lng!], { icon: tripPin('Į', directLineColor) })
          .addTo(map)
          .bindPopup(mapPopup('Atvykimas', trip.to_location));

        points.push([trip.from_lat!, trip.from_lng!]);
        points.push([trip.to_lat!, trip.to_lng!]);
      }

      let detour: number | undefined;
      if (hasDriverCoords && hasRequestCoords) {
        L.marker([request!.pickup_lat!, request!.pickup_lng!], { icon: passengerPin('A') })
          .addTo(map)
          .bindPopup(mapPopup('Keleivio paėmimas', request!.pickup_location));
        L.marker([request!.dropoff_lat!, request!.dropoff_lng!], { icon: passengerPin('B') })
          .addTo(map)
          .bindPopup(mapPopup('Keleivio išlaipinimas', request!.dropoff_location));

        points.push([request!.pickup_lat!, request!.pickup_lng!]);
        points.push([request!.dropoff_lat!, request!.dropoff_lng!]);

        if (driverRouteData && fullRouteData) {
          detour = Math.max(0, fullRouteData.distance - driverRouteData.distance);
        }
      }

      if (fullPoints) {
        const segments = [
          beforePickup?.coordinates ?? fullPoints.slice(0, 2),
          withPassenger?.coordinates ?? fullPoints.slice(1, 3),
          afterDropoff?.coordinates ?? fullPoints.slice(2, 4),
        ];
        L.polyline(segments[1], { color: combinedLineColor, weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map);
        for (const segment of [segments[0], segments[2]]) {
          L.polyline(segment, { color: driverLineColor, weight: 4, opacity: 1, dashArray: '8 10', lineCap: 'round' }).addTo(map);
        }
        // Both travellers share this road; the narrow dash keeps both styles visible.
        L.polyline(segments[1], { color: driverLineColor, weight: 2, opacity: 1, dashArray: '5 11', lineCap: 'round' }).addTo(map);
      } else if (driverPoints) {
        L.polyline(driverRouteData?.coordinates ?? driverPoints, {
          color: directLineColor, weight: 4, opacity: 1, dashArray: '8 10', lineCap: 'round',
        }).addTo(map);
      }

      if (points.length > 0) {
        map.fitBounds(points as L.LatLngBoundsExpression, { padding: [60, 60], maxZoom: 14 });
      }

      setRouteInfo({
        driverRoute: driverRouteData,
        passengerRoute: withPassenger ?? null,
        fullRoute: fullRouteData,
        detour,
      });
      setLoading(false);
    }

    void buildRoute();
    return () => controller.abort();
  }, [trip, request, hasDriverCoords, hasRequestCoords, directLineColor]);

  const driverDist = routeInfo.driverRoute?.distance ?? null;
  const passengerDist = routeInfo.passengerRoute?.distance ?? null;
  const fullDist = routeInfo.fullRoute?.distance ?? null;
  const routingFailed = !loading && hasDriverCoords && !(hasRequestCoords ? routeInfo.fullRoute : routeInfo.driverRoute);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center overscroll-none bg-overlay/50 backdrop-blur-sm sm:p-4">
      <div className="modal-panel ride-dialog w-full h-[100dvh] sm:h-[min(92dvh,900px)] sm:max-w-3xl bg-surface sm:rounded-3xl shadow-overlay overflow-hidden flex flex-col" data-role={trip.role} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="RoutePreviewModal-title">
        <div className="shrink-0 bg-surface/95 backdrop-blur px-4 sm:px-6 py-3.5 sm:py-4 border-b border-neutral-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="RoutePreviewModal-title" className="text-lg font-bold text-neutral-900">Maršruto peržiūra</h2>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">
              {trip.from_location} → {trip.to_location} · {formatDateTime(trip.departure_time)}
            </p>
          </div>
          <button
            data-dialog-close onClick={onClose}
            className="ui-button shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
            aria-label="Uždaryti maršruto peržiūrą"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <div className="relative w-full h-[48dvh] min-h-[280px] max-h-[560px] sm:h-[52dvh] sm:min-h-[360px] sm:max-h-[620px] rounded-2xl overflow-hidden border border-neutral-200">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 z-[500]">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>

          <div className="mt-4 space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            {hasDriverCoords && (
              <div className="rounded-xl bg-primary-50 border border-primary-200 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-900 mb-1">
                  <svg width="36" height="12" aria-hidden="true" className="shrink-0"><line x1="2" y1="6" x2="34" y2="6" stroke={directLineColor} strokeWidth="4" strokeDasharray="8 10" strokeLinecap="round" /></svg>
                  {hasRequestCoords ? 'Vairuotojas be keleivio' : `Tiesioginis ${trip.role === 'driver' ? 'vairuotojo' : 'keleivio'} maršrutas`}
                </div>
                <div className="text-sm text-primary-800">
                  {trip.from_location} → {trip.to_location}
                </div>
                {driverDist !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-primary-700 mt-1">
                    <RouteIcon className="w-3.5 h-3.5" />
                    {hasRequestCoords ? `Tiesioginis maršrutas palyginimui: ${formatDistance(driverDist)}` : formatDistance(driverDist)}
                  </div>
                )}
              </div>
            )}

            {hasRequestCoords && (
              <div className="rounded-xl bg-primary-50 border border-primary-200 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-900 mb-1">
                  <svg width="36" height="12" aria-hidden="true" className="shrink-0"><line x1="2" y1="6" x2="34" y2="6" stroke={combinedLineColor} strokeWidth="6" strokeLinecap="round" /><line x1="2" y1="6" x2="34" y2="6" stroke={driverLineColor} strokeWidth="2" strokeDasharray="5 11" strokeLinecap="round" /></svg>
                  Bendras važiavimas su keleiviu
                </div>
                <div className="text-sm text-primary-800">
                  {request!.pickup_location} → {request!.dropoff_location}
                </div>
                {passengerDist !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-primary-700 mt-1">
                    <RouteIcon className="w-3.5 h-3.5" />
                    {formatDistance(passengerDist)}
                  </div>
                )}
              </div>
            )}

            {hasDriverCoords && hasRequestCoords && (
              <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-primary-900">
                  Visas {request?.status === 'accepted' ? 'patvirtintas' : 'siūlomas'} maršrutas
                </div>
                <div className="text-sm text-primary-800">
                  Vairuotojo pradžia → keleivio paėmimas → keleivio išlaipinimas → vairuotojo tikslas
                </div>
                {fullDist !== null && <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-primary-700">
                  <RouteIcon className="h-3.5 w-3.5" />
                  {formatDistance(fullDist)}
                </div>}
              </div>
            )}

            {routeInfo.detour !== undefined && routeInfo.detour > 0 && (
              <div className={`rounded-xl p-3 text-sm ${
                routeInfo.detour < 5
                  ? 'bg-warning-50 border border-warning-200 text-warning-700'
                  : routeInfo.detour < 15
                    ? 'bg-warning-50 border border-warning-200 text-warning-700'
                    : 'bg-danger-50 border border-danger-200 text-danger-700'
              }`}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="w-4 h-4" />
                  Papildomai vairuotojui: +{formatDistance(routeInfo.detour)}
                </div>
              </div>
            )}

            {routingFailed && (
              <p className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800" role="status">
                Kelio atstumo apskaičiuoti nepavyko. Tiesios linijos kilometrai nerodomi, nes jie neatitiktų realaus važiavimo.
              </p>
            )}

            {!hasDriverCoords && (
              <p className="text-sm text-neutral-500">
                Vairuotojas nenurodė tikslių koordinačių, todėl maršrutas žemėlapyje nerodomas.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function tripPin(label: string, color: string): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:var(--shadow-sm);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${label}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
}

function passengerPin(label: string): L.DivIcon {
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:rgb(var(--role-passenger));transform:rotate(-45deg);border:2px solid white;box-shadow:var(--shadow-sm);"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${label}</span></div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 30] });
}
