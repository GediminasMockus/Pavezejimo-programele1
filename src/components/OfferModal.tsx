import { useDialogFocus } from '@/lib/useDialogFocus';
import { useMemo, useState } from 'react';
import { Car, Check, Loader2, MapPin, X } from 'lucide-react';
import { supabase, type Trip, type NewRideRequest } from '@/lib/supabase';
import { formatDateTime, formatPrice } from '@/lib/format';

export function OfferModal({
  passengerTrip,
  driverTrips,
  userId,
  onClose,
  onSubmitted,
}: {
  passengerTrip: Trip;
  driverTrips: Trip[];
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const dialogRef = useDialogFocus();
  const eligibleTrips = useMemo(() => driverTrips.filter((t) =>
    (t.available_seats ?? t.seats) >= passengerTrip.seats && t.status === 'active' && !t.deleted_at && new Date(t.departure_time).getTime() > Date.now() &&
    Math.abs(new Date(t.departure_time).getTime() - new Date(passengerTrip.departure_time).getTime()) <= 60 * 60_000
  ), [driverTrips, passengerTrip.departure_time, passengerTrip.seats]);
  const [selectedId, setSelectedId] = useState(eligibleTrips[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedTrip = eligibleTrips.find((t) => t.id === selectedId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedTrip) {
      setError('Pasirinkite savo vairuotojo kelionę.');
      return;
    }
    if (Math.abs(new Date(selectedTrip.departure_time).getTime() - new Date(passengerTrip.departure_time).getTime()) > 60 * 60_000) {
      setError('Pasiūlymo laikas turi sutapti su keleivio skelbimo laiku (leisti skirtumas iki 60 minučių).');
      return;
    }
    if (!passengerTrip.created_by) {
      setError('Šio keleivio skelbimo savininko nepavyko nustatyti.');
      return;
    }
    const payload: NewRideRequest = {
      trip_id: passengerTrip.id,
      request_type: 'driver_offer',
      passenger_id: passengerTrip.created_by,
      passenger_name: passengerTrip.name,
      pickup_location: passengerTrip.from_location,
      pickup_lat: passengerTrip.from_lat,
      pickup_lng: passengerTrip.from_lng,
      dropoff_location: passengerTrip.to_location,
      dropoff_lat: passengerTrip.to_lat,
      dropoff_lng: passengerTrip.to_lng,
      seats_needed: passengerTrip.seats,
      notes: message.trim() || undefined,
      driver_id: userId,
      driver_name: selectedTrip.name,
      driver_phone: selectedTrip.phone,
      driver_trip_id: selectedTrip.id,
    };
    setSubmitting(true);
    const { error: insertError } = await supabase.from('ride_requests').insert(payload);
    setSubmitting(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'Šiam keleivio skelbimui jau yra aktyvus pasiūlymas.' : 'Nepavyko išsiųsti pasiūlymo.');
      return;
    }
    onSubmitted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="modal-panel w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-overlay max-h-[92dvh] overflow-y-auto" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="OfferModal-title">
        <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h2 id="OfferModal-title" className="text-lg font-bold text-neutral-900">Siūlyti pavežėjimą</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Keleivis ieško: {passengerTrip.from_location} → {passengerTrip.to_location}</p>
          </div>
          <button data-dialog-close onClick={onClose} className="ui-button w-11 h-11 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100" aria-label="Uždaryti"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          <div className="rounded-2xl bg-primary-50 border border-primary-200 p-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-primary-700 mt-0.5" />
              <div className="text-sm"><p className="font-semibold text-primary-900">Keleivio maršrutas</p><p className="text-primary-800 mt-1">{passengerTrip.from_location} → {passengerTrip.to_location}</p><p className="text-xs text-primary-700 mt-1">{formatDateTime(passengerTrip.departure_time)}</p></div>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700 mb-2 block">Jūsų kelionė</label>
            {eligibleTrips.length === 0 ? <div className="rounded-xl bg-warning-50 border border-warning-200 p-3 text-sm text-warning-700">Neturite aktyvios vairuotojo kelionės tuo pačiu metu. Pirmiausia ją sukurkite.</div> : <div className="flex flex-col gap-2">{eligibleTrips.map((t) => {
              const sameTime = Math.abs(new Date(t.departure_time).getTime() - new Date(passengerTrip.departure_time).getTime()) <= 60 * 60_000;
              return <button type="button" key={t.id} onClick={() => setSelectedId(t.id)} className={`ui-button text-left rounded-xl border p-3 transition-all ${selectedId === t.id ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200' : 'border-neutral-200 hover:border-neutral-300'} ${!sameTime ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-semibold text-sm text-neutral-800 inline-flex items-center gap-1.5"><Car className="w-4 h-4 text-primary-500" />{t.from_location} → {t.to_location}</span>{selectedId === t.id && <Check className="w-4 h-4 text-primary-700" />}</div>
                <div className="text-xs text-neutral-500 mt-1">{formatDateTime(t.departure_time)}{formatPrice(t) ? ` · ${formatPrice(t)}` : ''}</div>
              </button>;
            })}</div>}
          </div>
          <div><label className="text-sm font-semibold text-neutral-700 mb-2 block">Žinutė keleiviui (nebūtina)</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} placeholder="Pvz. Galiu paimti prie stoties, važiuoju be sustojimų." className="form-input resize-none" /></div>
          {error && <p className="text-sm text-danger-700 bg-danger-50 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={submitting || eligibleTrips.length === 0} className="ui-button w-full py-3.5 rounded-xl bg-primary-600 text-on-primary font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Car className="w-5 h-5" />} Siųsti pasiūlymą</button>
        </form>
      </div>
    </div>
  );
}
