import { useEffect, useState } from 'react';
import { MapPin, User, Phone, Users, Briefcase, X, Loader2, Send, Route } from 'lucide-react';
import {
  supabase,
  type Trip,
  type NewRideRequest,
} from '@/lib/supabase';
import { AddressInput, type AddressValue } from '@/components/AddressInput';
import { haversineDistance, formatDistance, calculateDetour } from '@/lib/distance';
import { formatDateTime, formatPrice } from '@/lib/format';

export function RequestModal({
  trip,
  userId,
  onClose,
  onSubmitted,
}: {
  trip: Trip;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [passengerName, setPassengerName] = useState('');
  const [phone, setPhone] = useState('');
  const [seats, setSeats] = useState(1);
  const [pickupAddr, setPickupAddr] = useState<AddressValue>({
    display_name: '',
    lat: null,
    lng: null,
  });
  const [dropoffAddr, setDropoffAddr] = useState<AddressValue>({
    display_name: '',
    lat: null,
    lng: null,
  });
  const [baggage, setBaggage] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const hasDriverCoords =
    trip.from_lat !== null && trip.from_lng !== null && trip.to_lat !== null && trip.to_lng !== null;
  const hasRequestCoords =
    pickupAddr.lat !== null && pickupAddr.lng !== null && dropoffAddr.lat !== null && dropoffAddr.lng !== null;

  const detour =
    hasDriverCoords && hasRequestCoords
      ? calculateDetour(
          trip.from_lat!,
          trip.from_lng!,
          trip.to_lat!,
          trip.to_lng!,
          pickupAddr.lat,
          pickupAddr.lng,
          dropoffAddr.lat,
          dropoffAddr.lng,
        )
      : null;

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    supabase.from('user_profiles').select('display_name, phone').eq('id', userId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      if (data) {
        setPassengerName(data.display_name ?? '');
        setPhone(data.phone ?? '');
      }
      setProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const directDist =
    hasRequestCoords
      ? haversineDistance(pickupAddr.lat!, pickupAddr.lng!, dropoffAddr.lat!, dropoffAddr.lng!)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!passengerName.trim() || !pickupAddr.display_name.trim() || !dropoffAddr.display_name.trim()) {
      setFormError('Užpildykite vardą, iš kur ir į kur laukus.');
      return;
    }

    if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
      setFormError('Keleivių skaičius turi būti nuo 1 iki 8.');
      return;
    }

    if (passengerName.trim().length > 80 || pickupAddr.display_name.trim().length > 160 || dropoffAddr.display_name.trim().length > 160 || notes.trim().length > 500) {
      setFormError('Kai kurie laukai per ilgi. Sutrumpinkite tekstą.');
      return;
    }

    if (phone.trim() && !/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(phone.trim())) {
      setFormError('Įveskite teisingą telefono numerį.');
      return;
    }

    if (seats > trip.seats) {
      setFormError(`Vairuotojas siūlo tik ${trip.seats} vietas.`);
      return;
    }

    if (trip.status !== 'active' || trip.deleted_at) {
      setFormError('Šis skelbimas nebeaktyvus. Grįžkite į sąrašą ir pasirinkite kitą.');
      return;
    }

    if (new Date(trip.departure_time).getTime() <= Date.now()) {
      setFormError('Ši kelionė jau prasidėjo arba išvykimo laikas praėjo.');
      return;
    }

    if (trip.created_by === userId) {
      setFormError('Negalite siųsti užklausos į savo skelbimą.');
      return;
    }

    const { data: existing } = await supabase
      .from('ride_requests')
      .select('id,status')
      .eq('trip_id', trip.id)
      .eq('passenger_id', userId)
      .in('status', ['pending', 'accepted'])
      .limit(1);
    if (existing && existing.length > 0) {
      setFormError(existing[0].status === 'accepted' ? 'Šią kelionę jau pasirinkote.' : 'Šiai kelionei jau išsiuntėte užklausą.');
      return;
    }

    const payload: NewRideRequest = {
      trip_id: trip.id,
      passenger_name: passengerName.trim(),
      passenger_id: userId,
      pickup_location: pickupAddr.display_name.trim(),
      pickup_lat: pickupAddr.lat,
      pickup_lng: pickupAddr.lng,
      dropoff_location: dropoffAddr.display_name.trim(),
      dropoff_lat: dropoffAddr.lat,
      dropoff_lng: dropoffAddr.lng,
      seats_needed: seats,
    };
    if (phone.trim()) payload.passenger_phone = phone.trim();
    if (baggage) payload.baggage = baggage;
    if (notes.trim()) payload.notes = notes.trim();

    setSubmitting(true);
    const { error } = await supabase.from('ride_requests').insert(payload);
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') {
        setFormError('Šiai kelionei jau turite aktyvią užklausą.');
      } else {
        setFormError('Nepavyko išsiųsti užklausos. Bandykite dar kartą.');
      }
      return;
    }
    onSubmitted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md px-0 sm:px-4">
      <div className="w-full sm:max-w-lg bg-gradient-to-br from-white to-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-slate-900/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-emerald-500 to-teal-600 px-5 sm:px-6 pt-5 pb-4 flex items-center justify-between shadow-lg">
          <div>
            <h2 className="text-lg font-bold text-white">Pasirinkti skelbimą</h2>
            <p className="text-xs text-emerald-100 mt-0.5">
              {trip.from_location} → {trip.to_location} · {formatDateTime(trip.departure_time)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-sm text-blue-700">
            <p className="font-semibold mb-1">Vairuotojo maršrutas</p>
            <p>{trip.from_location} → {trip.to_location}</p>
            {trip.price !== null && (
              <p className="mt-1 text-blue-600">Kaina: {formatPrice(trip)}</p>
            )}
          </div>

          <Field label="Iš kur (paėmimo vieta)" icon={<MapPin className="w-4 h-4" />}>
            <AddressInput
              value={pickupAddr}
              onChange={setPickupAddr}
              placeholder="pvz. Vilnius, stotis"
            />
          </Field>

          <Field label="Į kur (išlaipinimo vieta)" icon={<MapPin className="w-4 h-4" />}>
            <AddressInput
              value={dropoffAddr}
              onChange={setDropoffAddr}
              placeholder="pvz. Trakai, pilis"
            />
          </Field>

          {detour && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-2.5">
              <Route className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Papildomas atstumas vairuotojui</p>
                <p className="mt-0.5">
                  Vairuotojo maršrutas: {formatDistance(detour.originalDistance)} →{' '}
                  {formatDistance(detour.newDistance)}{' '}
                  <span className="font-semibold">
                    (+{formatDistance(detour.detour)})
                  </span>
                </p>
                {directDist !== null && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Jūsų kelionės atstumas: {formatDistance(directDist)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Jūsų vardas" icon={<User className="w-4 h-4" />}>
              <input
                type="text"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                placeholder="pvz. Jonas"
                maxLength={80}
                className="form-input"
              />
            </Field>
            <Field label="Telefonas (nebūtina)" icon={<Phone className="w-4 h-4" />}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+370 ..."
                maxLength={30}
                className="form-input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Keleivių skaičius" icon={<Users className="w-4 h-4" />}>
              <input
                type="number"
                min={1}
                max={trip.seats}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
                className="form-input"
              />
            </Field>
            <Field label="Bagažas" icon={<Briefcase className="w-4 h-4" />}>
              <select
                value={baggage}
                onChange={(e) => setBaggage(e.target.value)}
                className="form-input"
              >
                <option value="">Nenurodyta</option>
                <option value="Nėra">Nėra bagažo</option>
                <option value="Mažas">Mažas (kuprinė)</option>
                <option value="Vidutinis">Vidutinis (lagaminas)</option>
                <option value="Didelis">Didelis (keli lagaminai)</option>
              </select>
            </Field>
          </div>

          <Field label="Pastabos vairuotojui (nebūtina)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="pvz. važiuoju su vaikų kėdute"
              rows={2}
              maxLength={500}
              className="form-input resize-none"
            />
          </Field>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || profileLoading}
            className="mt-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Siunčiama…</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>{profileLoading ? 'Tikrinama…' : 'Siųsti užklausą vairuotojui'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
        {icon && <span className="text-slate-400">{icon}</span>}
        {label}
      </span>
      {children}
    </label>
  );
}
