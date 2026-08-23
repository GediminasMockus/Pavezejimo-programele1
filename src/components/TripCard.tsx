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
import { formatDateTime, formatPrice } from '@/lib/format';
import { RatingStars } from '@/components/RatingStars';

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
      className={`rounded-2xl bg-white border p-4 sm:p-5 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 animate-fade-in ${
        highlight ? 'border-blue-400 ring-2 ring-blue-200/50 bg-gradient-to-br from-blue-50/50 to-white' : 'border-slate-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${
              isDriver
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
            }`}
          >
            {isDriver ? <Car className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {isDriver ? 'Vairuotojas' : 'Keleivis'}
          </span>
          {trip.is_recurring && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm">
              <Repeat className="w-3.5 h-3.5" />
              Pasikartojantis
            </span>
          )}
          <span className="text-xs text-slate-400">{formatDateTime(trip.departure_time)}</span>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              aria-label={`Redaguoti skelbimą: ${trip.from_location} → ${trip.to_location}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDeleteRequest && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              aria-label={`Pašalinti skelbimą: ${trip.from_location} → ${trip.to_location}`}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-slate-900">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className={`w-4 h-4 flex-shrink-0 ${fromIconColor}`} />
            <span className="font-semibold truncate">{trip.from_location}</span>
          </div>
          <div className="ml-2 border-l-2 border-dashed border-slate-300 h-4 my-0.5" />
          <div className="flex items-center gap-2">
            <MapPin className={`w-4 h-4 flex-shrink-0 ${toIconColor}`} />
            <span className="font-semibold truncate">{trip.to_location}</span>
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          {priceStr && (
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 shadow-md shadow-amber-500/30">
              <Euro className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white">{priceStr}</span>
            </div>
          )}
          {distance !== null && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
              <Route className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">≈ {formatDistance(distance)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <button
          onClick={onShowProfile}
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-600 hover:underline transition-colors"
        >
          <User className="w-3.5 h-3.5 text-slate-400" />
          {trip.name}
          {userRating && userRating.total > 0 && (
            <span className="inline-flex items-center gap-0.5 ml-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-xs font-medium text-slate-500">{userRating.avg.toFixed(1)}</span>
            </span>
          )}
        </button>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          {trip.seats} {isDriver ? 'vietos' : 'keleiviai'}
        </span>
        {showPrivateDetails && trip.phone && (
          <a
            href={`tel:${trip.phone}`}
            className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
          >
            <Phone className="w-3.5 h-3.5" />
            {trip.phone}
          </a>
        )}
      </div>

      {isDriver && carInfo && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 bg-blue-50 rounded-lg px-3 py-1.5">
          <Car className="w-3.5 h-3.5 text-blue-500" />
          {showPrivateDetails ? carInfo : [trip.car_make, trip.car_color].filter(Boolean).join(' · ')}
        </div>
      )}

      {!isDriver && trip.baggage && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 bg-emerald-50 rounded-lg px-3 py-1.5">
          <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
          Bagažas: {trip.baggage}
        </div>
      )}

      {trip.notes && (
        <p className="mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{trip.notes}</p>
      )}

      {onPreviewRoute && (
        <button
          onClick={onPreviewRoute}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 text-sm font-semibold hover:from-slate-200 hover:to-slate-300 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
          aria-label={`Peržiūrėti maršrutą žemėlapyje: ${trip.from_location} → ${trip.to_location}`}
        >
          <MapIcon className="w-4 h-4" />
          Peržiūrėti maršrutą žemėlapyje
        </button>
      )}

      {onChat && !onSelect && (
        <button
          onClick={onChat}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] transition-all shadow-md shadow-blue-500/30"
          aria-label={`Susisiekti dėl kainos: ${trip.from_location} → ${trip.to_location}`}
        >
          <MessageSquare className="w-4 h-4" />
          Susisiekti dėl kainos
        </button>
      )}

      {onSelect && (
        <button
          onClick={onSelect}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/30 animate-gradient-x"
          aria-label={`${selectLabel ?? 'Pasirinkti šį skelbimą'}: ${trip.from_location} → ${trip.to_location}`}
        >
          <Hand className="w-4 h-4" />
          {selectLabel ?? 'Pasirinkti šį skelbimą'}
        </button>
      )}

      {pendingCount !== undefined && pendingCount > 0 && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1">
          <Clock className="w-3.5 h-3.5" />
          {pendingCount} {pendingCount === 1 ? 'laukianti užklausa' : 'laukiančios užklausos'}
        </div>
      )}
    </div>
  );
}
