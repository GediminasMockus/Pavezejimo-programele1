import { useState } from 'react';
import {
  Car,
  Users,
  MapPin,
  Phone,
  User,
  Trash2,
  Loader2,
  MessageSquare,
  Route,
  Pencil,
  Briefcase,
  Hand,
  Clock,
  Repeat,
  Map as MapIcon,
  Star,
} from 'lucide-react';
import type { Trip } from '@/lib/supabase';
import { haversineDistance, formatDistance } from '@/lib/distance';
import { formatDateTime, formatPrice, formatTripExpiryCountdown } from '@/lib/format';

export function TripCard({
  trip,
  highlight,
  onEdit,
  onDeleteRequest,
  onChat,
  onSelect,
  pendingCount,
  onPreviewRoute,
  onShowProfile,
  userRating,
  showPrivateDetails = false,
  selectLabel,
  currentTime = Date.now(),
}: {
  trip: Trip;
  highlight?: boolean;
  onEdit?: () => void;
  onDeleteRequest?: () => void;
  onChat?: () => void;
  onSelect?: () => void;
  pendingCount?: number;
  onPreviewRoute?: () => void;
  onShowProfile?: () => void;
  userRating?: { avg: number; total: number } | null;
  showPrivateDetails?: boolean;
  selectLabel?: string;
  currentTime?: number;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onDeleteRequest?.();
    setDeleting(false);
  }

  const isDriver = trip.role === 'driver';
  const priceStr = formatPrice(trip);
  const expiryMessage = trip.status === 'active' && !trip.is_recurring
    ? formatTripExpiryCountdown(trip.departure_time, currentTime)
    : null;

  const hasCoords =
    trip.from_lat !== null &&
    trip.from_lng !== null &&
    trip.to_lat !== null &&
    trip.to_lng !== null;
  const distance = hasCoords
    ? haversineDistance(
        trip.from_lat!,
        trip.from_lng!,
        trip.to_lat!,
        trip.to_lng!,
      )
    : null;

  const carInfo = [trip.car_make, trip.car_color, trip.car_plate]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={`trip-card animate-fade-in ${highlight ? 'trip-card-highlight' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="badge">
            {isDriver ? <Car /> : <Users />}
            {isDriver ? 'Vairuotojas' : 'Keleivis'}
          </span>
          {trip.is_recurring && <span className="badge"><Repeat />Pasikartojantis</span>}
          {expiryMessage && (
            <span className="badge badge-warning whitespace-nowrap tabular-nums" role="status" title={expiryMessage} aria-label={expiryMessage}>
              <Clock />
              {expiryMessage.replace('Liko ', '').replace(' val.', 'v').replace(' min.', 'm')}
            </span>
          )}
        </div>
        {(onEdit || onDeleteRequest) && (
          <div className="-mr-2 -mt-2 flex shrink-0 items-center">
            {onEdit && <button onClick={onEdit} className="icon-button" aria-label={`Redaguoti skelbimą: ${trip.from_location} → ${trip.to_location}`}><Pencil className="h-4 w-4" /></button>}
            {onDeleteRequest && <button onClick={handleDelete} disabled={deleting} className="icon-button hover:bg-danger-50 hover:text-danger-700" aria-label={`Pašalinti skelbimą: ${trip.from_location} → ${trip.to_location}`}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <time dateTime={trip.departure_time} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700"><Clock className="h-4 w-4 text-neutral-500" />{formatDateTime(trip.departure_time)}</time>
        {priceStr && <span className="ml-auto text-base font-semibold tabular-nums text-neutral-900">{priceStr}</span>}
      </div>
      <div className="trip-route">
        <div className="trip-route-stop"><MapPin /><span className="min-w-0">{trip.from_location}</span></div>
        <div className="trip-route-line" />
        <div className="trip-route-stop"><MapPin /><span className="min-w-0">{trip.to_location}</span></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600">
        <button onClick={onShowProfile} className="ui-button inline-flex min-w-0 items-center gap-1.5 text-left hover:text-primary-700 hover:underline">
          <User className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{trip.name}</span>
          {userRating && userRating.total > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-xs"><Star className="h-3 w-3 fill-neutral-500 text-neutral-500" />{userRating.avg.toFixed(1)}</span>}
        </button>
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{trip.seats} {isDriver ? 'vietos' : 'keleiviai'}</span>
        {distance !== null && <span className="inline-flex items-center gap-1.5 text-xs"><Route className="h-3.5 w-3.5" />≈ {formatDistance(distance)}</span>}
        {showPrivateDetails && trip.phone && <a href={`tel:${trip.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-primary-700 hover:underline"><Phone className="h-4 w-4" />{trip.phone}</a>}
      </div>
      {isDriver && carInfo && <div className="mt-2 flex items-start gap-2 text-xs text-neutral-500"><Car className="h-4 w-4 shrink-0" /><span>{showPrivateDetails ? carInfo : [trip.car_make, trip.car_color].filter(Boolean).join(' · ')}</span></div>}
      {!isDriver && trip.baggage && <div className="mt-2 flex items-start gap-2 text-xs text-neutral-500"><Briefcase className="h-4 w-4 shrink-0" /><span>Bagažas: {trip.baggage}</span></div>}
      {trip.notes && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm leading-relaxed text-neutral-600">{trip.notes}</p>}

      {(onPreviewRoute || onChat || onSelect) && <div className="trip-actions">
        {onPreviewRoute && <button type="button" onClick={onPreviewRoute} className="btn-secondary" aria-label={`Peržiūrėti maršrutą žemėlapyje: ${trip.from_location} → ${trip.to_location}`}><MapIcon className="h-4 w-4" />{onSelect ? 'Maršrutas' : 'Peržiūrėti maršrutą žemėlapyje'}</button>}
        {onChat && !onSelect && <button onClick={onChat} className="btn-primary" aria-label={`Susisiekti dėl kainos: ${trip.from_location} → ${trip.to_location}`}><MessageSquare className="h-4 w-4" />Susisiekti dėl kainos</button>}
        {onSelect && <button onClick={onSelect} className="btn-primary" aria-label={`${selectLabel ?? 'Pasirinkti šį skelbimą'}: ${trip.from_location} → ${trip.to_location}`}><Hand className="h-4 w-4" />{selectLabel ?? 'Pasirinkti'}</button>}
      </div>}
      {pendingCount !== undefined && pendingCount > 0 && <div className="badge badge-warning mt-3"><Clock />{pendingCount} {pendingCount === 1 ? 'laukianti užklausa' : 'laukiančios užklausos'}</div>}
    </article>
  );
}
