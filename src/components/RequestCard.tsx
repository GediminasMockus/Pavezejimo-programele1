import {
  MapPin,
  User,
  Phone,
  Users,
  Briefcase,
  Clock,
  Route,
  Check,
  X,
  Loader2,
  MessageSquare,
  AlertCircle,
  Map as MapIcon,
} from 'lucide-react';
import type { Trip, RideRequest, RequestStatus } from '@/lib/supabase';
import { calculateDetour, formatDistance, haversineDistance } from '@/lib/distance';
import { formatDateTime } from '@/lib/format';

const STATUS_CONFIG: Record<RequestStatus, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  pending: { label: 'Laukia patvirtinimo', bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  accepted: { label: 'Patvirtinta', bg: 'bg-emerald-100', text: 'text-emerald-700', icon: Check },
  rejected: { label: 'Atmesta', bg: 'bg-red-100', text: 'text-red-700', icon: X },
  cancelled: { label: 'Atšaukta', bg: 'bg-slate-100', text: 'text-slate-500', icon: AlertCircle },
};

export function RequestCard({
  request,
  trip,
  isDriverView,
  onAccept,
  onReject,
  onCancel,
  onChat,
  onPreviewRoute,
  isOffer = false,
}: {
  request: RideRequest;
  trip: Trip;
  isDriverView: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onChat?: () => void;
  onPreviewRoute?: () => void;
  isOffer?: boolean;
}) {
  const status = STATUS_CONFIG[request.status];
  const StatusIcon = status.icon;

  const hasDriverCoords =
    trip.from_lat !== null && trip.from_lng !== null && trip.to_lat !== null && trip.to_lng !== null;
  const hasRequestCoords =
    request.pickup_lat !== null &&
    request.pickup_lng !== null &&
    request.dropoff_lat !== null &&
    request.dropoff_lng !== null;

  const detour =
    hasDriverCoords && hasRequestCoords
      ? calculateDetour(
          trip.from_lat!,
          trip.from_lng!,
          trip.to_lat!,
          trip.to_lng!,
          request.pickup_lat,
          request.pickup_lng,
          request.dropoff_lat,
          request.dropoff_lng,
        )
      : null;

  const passengerDist = hasRequestCoords
    ? haversineDistance(
        request.pickup_lat!,
        request.pickup_lng!,
        request.dropoff_lat!,
        request.dropoff_lng!,
      )
    : null;

  const isPending = request.status === 'pending';

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {isOffer && request.status === 'accepted' ? 'Pasiūlymas priimtas' : isOffer && request.status === 'pending' ? 'Laukia jūsų atsakymo' : status.label}
          </span>
          <span className="text-xs text-slate-400">{formatDateTime(request.created_at)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-slate-900">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-emerald-500" />
            <span className="font-semibold truncate text-sm">{request.pickup_location}</span>
          </div>
          <div className="ml-2 border-l-2 border-dashed border-slate-300 h-4 my-0.5" />
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span className="font-semibold truncate text-sm">{request.dropoff_location}</span>
          </div>
        </div>
        {passengerDist !== null && (
          <div className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
            <Route className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{formatDistance(passengerDist)}</span>
          </div>
        )}
      </div>

      {isOffer && request.driver_name && (
        <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 p-3">
          <div className="text-sm font-semibold text-blue-900">Vairuotojo pasiūlymas</div>
          <div className="mt-1 text-sm text-blue-800">{request.driver_name}</div>
          {request.driver_phone && <a href={`tel:${request.driver_phone}`} className="text-xs text-blue-700 hover:underline">{request.driver_phone}</a>}
        </div>
      )}

      {isDriverView && !isOffer && detour && (
        <div className={`mt-3 rounded-xl p-3 text-sm ${
          detour.detour < 5
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : detour.detour < 15
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <Route className="w-4 h-4" />
            Nuokrypis nuo maršruto
          </div>
          <p>
            Jūsų maršrutas: {formatDistance(detour.originalDistance)} →{' '}
            {formatDistance(detour.newDistance)}{' '}
            <span className="font-bold">(+{formatDistance(detour.detour)})</span>
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-slate-400" />
          {isOffer ? (isDriverView ? request.passenger_name : 'Jūsų skelbimas') : request.passenger_name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          {request.seats_needed} {request.seats_needed === 1 ? 'keleivis' : 'keleiviai'}
        </span>
        {request.passenger_phone && (
          <a
            href={`tel:${request.passenger_phone}`}
            className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
          >
            <Phone className="w-3.5 h-3.5" />
            {request.passenger_phone}
          </a>
        )}
        {request.baggage && (
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
            {request.baggage}
          </span>
        )}
      </div>

      {request.notes && (
        <p className="mt-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{request.notes}</p>
      )}

      {request.driver_message && (
        <p className="mt-2 text-sm text-slate-600 bg-blue-50 rounded-lg px-3 py-2">
          <span className="font-semibold">Vairuotojo atsakymas: </span>
          {request.driver_message}
        </p>
      )}

      {isOffer && !isDriverView && isPending && (
        <div className="mt-3 flex gap-2">
          <button onClick={onReject} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100"><X className="w-4 h-4 inline mr-1" />Atmesti</button>
          <button onClick={onAccept} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"><Check className="w-4 h-4 inline mr-1" />Priimti pasiūlymą</button>
        </div>
      )}

      {isDriverView && !isOffer && isPending && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onReject}
            className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Atmesti
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Patvirtinti
          </button>
        </div>
      )}

      {isOffer && isDriverView && isPending && onCancel && (
        <button onClick={onCancel} className="mt-3 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"><X className="w-4 h-4 inline mr-1" />Atšaukti pasiūlymą</button>
      )}

      {!isDriverView && !isOffer && isPending && (
        <button
          onClick={onCancel}
          className="mt-3 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" />
          Atšaukti užklausą
        </button>
      )}

      {request.status === 'accepted' && onChat && (
        <button
          onClick={onChat}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 active:scale-[0.98] transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          Susisiekti
        </button>
      )}

      {onPreviewRoute && (
        <button
          onClick={onPreviewRoute}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 active:scale-[0.98] transition-all"
        >
          <MapIcon className="w-4 h-4" />
          Peržiūrėti maršrutą
        </button>
      )}
    </div>
  );
}
