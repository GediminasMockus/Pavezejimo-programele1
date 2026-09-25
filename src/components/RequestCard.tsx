import { useState } from 'react';
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
  MessageSquare,
  AlertCircle,
  Map as MapIcon,
  Navigation,
} from 'lucide-react';
import type { Trip, RideRequest, RequestStatus } from '@/lib/supabase';
import { calculateDetour, formatDistance, haversineDistance } from '@/lib/distance';
import { formatDateTime } from '@/lib/format';
import { CancelRequestModal } from '@/components/CancelRequestModal';
import { useRoadDistance } from '@/lib/useRoadDistance';

const STATUS_CONFIG: Record<RequestStatus, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  pending: { label: 'Laukia patvirtinimo', bg: 'bg-warning-100', text: 'text-warning-700', icon: Clock },
  accepted: { label: 'Patvirtinta', bg: 'bg-success-100', text: 'text-success-700', icon: Check },
  rejected: { label: 'Atmesta', bg: 'bg-danger-100', text: 'text-danger-700', icon: X },
  cancelled: { label: 'Atšaukta', bg: 'bg-neutral-100', text: 'text-neutral-500', icon: AlertCircle },
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
  onNavigation,
  isOffer = false,
  highlighted = false,
}: {
  request: RideRequest;
  trip: Trip | null;
  isDriverView: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void | Promise<void>;
  onChat?: () => void;
  onPreviewRoute?: () => void;
  onNavigation?: () => void;
  isOffer?: boolean;
  highlighted?: boolean;
}) {
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const { ref: cardRef, distanceKm } = useRoadDistance(request.pickup_lat, request.pickup_lng, request.dropoff_lat, request.dropoff_lng);
  const status = STATUS_CONFIG[request.status];
  const StatusIcon = status.icon;

  const hasDriverCoords =
    trip !== null && trip.from_lat !== null && trip.from_lng !== null && trip.to_lat !== null && trip.to_lng !== null;
  const hasRequestCoords =
    request.pickup_lat !== null &&
    request.pickup_lng !== null &&
    request.dropoff_lat !== null &&
    request.dropoff_lng !== null;

  const detour =
    hasDriverCoords && hasRequestCoords
      ? calculateDetour(
          trip!.from_lat!,
          trip!.from_lng!,
          trip!.to_lat!,
          trip!.to_lng!,
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
    <div ref={cardRef} id={`request-${request.id}`} data-status={request.status} className={`surface-card request-card min-w-0 scroll-mt-24 p-4 sm:p-5 animate-fade-in ${highlighted ? 'ring-4 ring-primary-300 ring-offset-2' : ''} ${request.status === 'accepted' ? 'order-first' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${status.bg} ${status.text}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {isOffer && request.status === 'accepted' ? 'Pasiūlymas priimtas' : isOffer && request.status === 'pending' ? 'Laukia jūsų atsakymo' : status.label}
          </span>
          <span className="text-xs text-neutral-500">{formatDateTime(request.created_at)}</span>
        </div>
        {request.status === 'accepted' && !request.completed_at && onCancel && (
          <button
            onClick={() => setShowCancelConfirmation(true)}
            aria-label="Atšaukti kelionę"
            className="ui-button flex-shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger-50 px-3 py-2 text-xs font-semibold text-danger-700 shadow-sm transition-all hover:bg-danger-100 active:scale-[0.98]"
          >
            <X className="h-3.5 w-3.5" />
            Atšaukti
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-neutral-900">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-neutral-500" />
            <span className="min-w-0 font-semibold break-words text-sm">{request.pickup_location}</span>
          </div>
          <div className="ml-2 border-l-2 border-dashed border-neutral-300 h-4 my-0.5" />
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 flex-shrink-0 text-primary-700" />
            <span className="min-w-0 font-semibold break-words text-sm">{request.dropoff_location}</span>
          </div>
        </div>
        {passengerDist !== null && (
          <div className="inline-flex shrink-0 flex-col items-center rounded-lg bg-neutral-100 px-2.5 py-1 text-neutral-600" title={distanceKm === null ? 'Kelio atstumo apskaičiuoti nepavyko; rodomas atstumas tiesia linija' : 'Atstumas keliu pagal maršruto peržiūros šaltinį'}>
            <span className="inline-flex items-center gap-1">
            <Route className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{distanceKm === undefined ? '…' : formatDistance(distanceKm ?? passengerDist)}</span>
            </span>
            <span className="text-[10px]">{distanceKm === undefined ? 'skaičiuojama' : distanceKm === null ? 'tiesia linija' : 'keliu'}</span>
          </div>
        )}
      </div>

      {isOffer && request.driver_name && (
        <div className="mt-3 rounded-xl bg-primary-50 border border-primary-200 p-3">
          <div className="text-sm font-semibold text-primary-900">Vairuotojo pasiūlymas</div>
          <div className="mt-1 text-sm text-primary-800">{request.driver_name}</div>
          {request.driver_phone && <a href={`tel:${request.driver_phone}`} className="text-xs text-primary-700 hover:underline">{request.driver_phone}</a>}
        </div>
      )}

      {isDriverView && !isOffer && detour && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <Route className="w-4 h-4" />
            Preliminarus nuokrypis tiesia linija
          </div>
          <p>
            Jūsų maršrutas: {formatDistance(detour.originalDistance)} →{' '}
            {formatDistance(detour.newDistance)}{' '}
            <span className="font-bold">(+{formatDistance(detour.detour)})</span>
          </p>
          <p className="mt-1 text-xs">Tikslų apvažiavimą keliu rasite maršruto peržiūroje.</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-neutral-500" />
          {isOffer ? (isDriverView ? request.passenger_name : 'Jūsų skelbimas') : request.passenger_name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-neutral-500" />
          {request.seats_needed} {request.seats_needed === 1 ? 'keleivis' : 'keleiviai'}
        </span>
        {request.passenger_phone && (
          <a
            href={`tel:${request.passenger_phone}`}
            className="inline-flex items-center gap-1.5 text-primary-700 hover:underline"
          >
            <Phone className="w-3.5 h-3.5" />
            {request.passenger_phone}
          </a>
        )}
        {request.baggage && (
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-neutral-500" />
            {request.baggage}
          </span>
        )}
      </div>

      {request.notes && (
        <p className="mt-2 text-sm text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">{request.notes}</p>
      )}

      {request.driver_message && (
        <p className="mt-2 text-sm text-neutral-600 bg-primary-50 rounded-lg px-3 py-2">
          <span className="font-semibold">Vairuotojo atsakymas: </span>
          {request.driver_message}
        </p>
      )}

      {isOffer && !isDriverView && isPending && (
        <div className="request-actions mt-4">
          <button onClick={onReject} className="ui-button flex-1 py-2.5 rounded-xl bg-danger-50 text-danger-700 text-sm font-semibold hover:bg-danger-100"><X className="w-4 h-4 inline mr-1" />Atmesti</button>
          <button onClick={onAccept} className="ui-button flex-1 py-2.5 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold hover:bg-primary-700"><Check className="w-4 h-4 inline mr-1" />Priimti pasiūlymą</button>
        </div>
      )}

      {isDriverView && !isOffer && isPending && (
        <div className="request-actions mt-3">
          <button
            onClick={onReject}
            className="ui-button flex-1 py-2.5 rounded-xl bg-danger-50 text-danger-700 text-sm font-semibold hover:bg-danger-100 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Atmesti
          </button>
          <button
            onClick={onAccept}
            className="ui-button flex-1 py-2.5 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Patvirtinti
          </button>
        </div>
      )}

      {isOffer && isDriverView && isPending && onCancel && (
        <button onClick={() => setShowCancelConfirmation(true)} className="ui-button mt-3 w-full py-2.5 rounded-xl bg-neutral-100 text-neutral-600 text-sm font-semibold hover:bg-neutral-200"><X className="w-4 h-4 inline mr-1" />Atšaukti pasiūlymą</button>
      )}

      {!isDriverView && !isOffer && isPending && (
        <button
          onClick={() => setShowCancelConfirmation(true)}
          className="ui-button mt-3 w-full py-2.5 rounded-xl bg-neutral-100 text-neutral-600 text-sm font-semibold hover:bg-neutral-200 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" />
          Atšaukti užklausą
        </button>
      )}

      {request.status === 'accepted' && (
        <div className="request-actions mt-3">
          {onChat && (
            <button
              onClick={onChat}
              className="ui-button flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-50 text-primary-700 text-sm font-semibold hover:bg-primary-100 active:scale-[0.98] transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              Susisiekti
            </button>
          )}
          {onNavigation && (
            <button
              onClick={onNavigation}
              className="ui-button flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold active:scale-95 transition-all shadow-md "
            >
              <Navigation className="w-4 h-4" />
              Navigacija
            </button>
          )}
        </div>
      )}

      {onPreviewRoute && (
        <button
          onClick={onPreviewRoute}
          className="ui-button mt-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <MapIcon className="w-3.5 h-3.5" />
          Peržiūrėti maršrutą
        </button>
      )}

      {showCancelConfirmation && onCancel && (
        <CancelRequestModal
          request={request}
          onClose={() => setShowCancelConfirmation(false)}
          onConfirm={async () => {
            await onCancel();
            setShowCancelConfirmation(false);
          }}
        />
      )}
    </div>
  );
}
