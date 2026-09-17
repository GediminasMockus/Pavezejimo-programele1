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
  Euro,
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
  const fromIconColor = isDriver ? 'text-blue-500' : 'text-emerald-500';
  const toIconColor = isDriver ? 'text-blue-600' : 'text-emerald-600';
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
    <div
      className={`w-full max-w-full min-w-0 overflow-hidden rounded-2xl bg-white border p-3 sm:p-4 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 animate-fade-in ${
        highlight ? 'border-blue-400 ring-2 ring-blue-200/50 bg-gradient-to-br from-blue-50/50 to-white' : 'border-slate-200 hover:border-blue-300'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 flex items-start gap-1.5">
          <span
            className={`inline-flex flex-shrink-0 items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shadow-sm ${
              isDriver
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
            }`}
          >
            {isDriver ? <Car className="w-3 h-3" /> : <Users className="w-3 h-3" />}
            {isDriver ? 'Vairuotojas' : 'Keleivis'}
          </span>
          {expiryMessage && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold leading-normal text-red-700 whitespace-nowrap" role="status">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>{expiryMessage}</span>
            </span>
          )}
          {trip.is_recurring && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm">
              <Repeat className="w-3 h-3" />
              Pasikartojantis
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-1">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              aria-label={`Redaguoti skelbimą: ${trip.from_location} → ${trip.to_location}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDeleteRequest && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              aria-label={`Pašalinti skelbimą: ${trip.from_location} → ${trip.to_location}`}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="mt-1.5 text-xs text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
        {formatDateTime(trip.departure_time)}
      </div>

      <div className="mt-2 text-slate-900">
        <div className="flex items-start gap-1.5">
          <MapPin className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${fromIconColor}`} />
          <span className="min-w-0 font-semibold text-sm leading-snug break-words">{trip.from_location}</span>
        </div>
        <div className="ml-1.5 border-l-2 border-dashed border-slate-300 h-3 my-0.5" />
        <div className="flex items-start gap-1.5">
          <MapPin className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${toIconColor}`} />
          <span className="min-w-0 font-semibold text-sm leading-snug break-words">{trip.to_location}</span>
        </div>
      </div>

      {(priceStr || distance !== null) && (
        <div className="mt-2 space-y-1.5">
          {priceStr && (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 shadow-md shadow-amber-500/30">
              <Euro className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-bold text-white">{priceStr}</span>
            </div>
          )}
          {distance !== null && (
            <div className="flex">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                <Route className="w-3 h-3" />
                <span className="text-xs font-medium">≈ {formatDistance(distance)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <button onClick={onShowProfile} className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 hover:underline transition-colors">
          <User className="w-3 h-3 text-slate-400" />
          {trip.name}
          {userRating && userRating.total > 0 && (
            <span className="inline-flex items-center gap-0.5 ml-1">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              <span className="text-xs font-medium text-slate-500">{userRating.avg.toFixed(1)}</span>
            </span>
          )}
        </button>
        <span className="inline-flex items-center gap-1">
          <Users className="w-3 h-3 text-slate-400" />
          {trip.seats} {isDriver ? 'vietos' : 'keleiviai'}
        </span>
        {showPrivateDetails && trip.phone && (
          <a href={`tel:${trip.phone}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            <Phone className="w-3 h-3" />
            {trip.phone}
          </a>
        )}
      </div>

      {isDriver && carInfo && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-600 bg-blue-50 rounded-lg px-2 py-1 max-w-full">
          <Car className="w-3 h-3 text-blue-500 flex-shrink-0" />
          <span className="break-words">{showPrivateDetails ? carInfo : [trip.car_make, trip.car_color].filter(Boolean).join(' · ')}</span>
        </div>
      )}

      {!isDriver && trip.baggage && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-600 bg-emerald-50 rounded-lg px-2 py-1">
          <Briefcase className="w-3 h-3 text-emerald-500" />
          Bagažas: {trip.baggage}
        </div>
      )}

      {trip.notes && <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5 break-words">{trip.notes}</p>}

      {onPreviewRoute && !onSelect && (
        <button
          onClick={onPreviewRoute}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 text-xs font-semibold hover:from-slate-200 hover:to-slate-300 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
          aria-label={`Peržiūrėti maršrutą žemėlapyje: ${trip.from_location} → ${trip.to_location}`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          Peržiūrėti maršrutą žemėlapyje
        </button>
      )}

      {onChat && !onSelect && (
        <button
          onClick={onChat}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-semibold hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] transition-all shadow-md shadow-blue-500/30"
          aria-label={`Susisiekti dėl kainos: ${trip.from_location} → ${trip.to_location}`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Susisiekti dėl kainos
        </button>
      )}

      {onSelect && (
        <div className="mt-2 flex gap-2">
          {onPreviewRoute && (
            <button
              type="button"
              onClick={onPreviewRoute}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              aria-label={`Peržiūrėti maršrutą žemėlapyje: ${trip.from_location} → ${trip.to_location}`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Maršrutas
            </button>
          )}
          <button
            onClick={onSelect}
            className="inline-flex min-h-10 flex-[1.6] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 active:scale-[0.98] animate-gradient-x"
            aria-label={`${selectLabel ?? 'Pasirinkti šį skelbimą'}: ${trip.from_location} → ${trip.to_location}`}
          >
            <Hand className="w-3.5 h-3.5" />
            {selectLabel ?? 'Pasirinkti'}
          </button>
        </div>
      )}

      {pendingCount !== undefined && pendingCount > 0 && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg px-2 py-0.5">
          <Clock className="w-3 h-3" />
          {pendingCount} {pendingCount === 1 ? 'laukianti užklausa' : 'laukiančios užklausos'}
        </div>
      )}
    </div>
  );
}
