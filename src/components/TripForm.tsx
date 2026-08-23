import { useEffect, useState } from 'react';
import {
  MapPin,
  Clock,
  Phone,
  User,
  Users,
  Euro,
  X,
  Loader2,
  Car,
  Briefcase,
  Repeat,
} from 'lucide-react';
import {
  supabase,
  type Trip,
  type TripRole,
  type NewTrip,
  type PriceUnit,
} from '@/lib/supabase';
import { AddressInput, type AddressValue } from '@/components/AddressInput';
import { toLocalInput } from '@/lib/format';

export function TripForm({
  role,
  userId,
  editTrip,
  onClose,
  onSubmitted,
}: {
  role: TripRole;
  userId: string;
  editTrip?: Trip | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const isDriver = role === 'driver';

  const [fromAddr, setFromAddr] = useState<AddressValue>({
    display_name: editTrip?.from_location ?? '',
    lat: editTrip?.from_lat ?? null,
    lng: editTrip?.from_lng ?? null,
  });
  const [toAddr, setToAddr] = useState<AddressValue>({
    display_name: editTrip?.to_location ?? '',
    lat: editTrip?.to_lat ?? null,
    lng: editTrip?.to_lng ?? null,
  });
  const [departureTime, setDepartureTime] = useState(
    editTrip
      ? toLocalInput(new Date(editTrip.departure_time))
      : toLocalInput(new Date(Date.now() + 3600_000)),
  );
  const [name, setName] = useState(editTrip?.name ?? '');
  const [phone, setPhone] = useState(editTrip?.phone ?? '');
  const [seats, setSeats] = useState(editTrip?.seats ?? 1);
  const [price, setPrice] = useState(editTrip?.price?.toString() ?? '');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(
    (editTrip?.price_unit as PriceUnit) ?? 'asmeniui',
  );
  const [carColor, setCarColor] = useState(editTrip?.car_color ?? '');
  const [carMake, setCarMake] = useState(editTrip?.car_make ?? '');
  const [carPlate, setCarPlate] = useState(editTrip?.car_plate ?? '');
  const [baggage, setBaggage] = useState(editTrip?.baggage ?? '');
  const [notes, setNotes] = useState(editTrip?.notes ?? '');
  const [isRecurring, setIsRecurring] = useState(editTrip?.is_recurring ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (editTrip) return;
    supabase.from('user_profiles').select('display_name, phone').eq('id', userId).maybeSingle().then(({ data }) => {
      if (data?.display_name) setName(data.display_name);
      if (data?.phone) setPhone(data.phone);
    });
  }, [userId, editTrip]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!fromAddr.display_name.trim() || !toAddr.display_name.trim() || !name.trim()) {
      setFormError('Užpildykite iš, į kur ir vardą.');
      return;
    }

    const departure = new Date(departureTime);
    if (Number.isNaN(departure.getTime())) {
      setFormError('Pasirinkite teisingą išvykimo laiką.');
      return;
    }
    if (departure.getTime() < Date.now() + 5 * 60 * 1000) {
      setFormError('Išvykimo laikas turi būti bent po 5 minučių.');
      return;
    }

    if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
      setFormError('Vietų skaičius turi būti nuo 1 iki 8.');
      return;
    }

    if (name.trim().length > 80 || fromAddr.display_name.trim().length > 160 || toAddr.display_name.trim().length > 160 || notes.trim().length > 500) {
      setFormError('Kai kurie laukai per ilgi. Sutrumpinkite tekstą.');
      return;
    }

    if (phone.trim() && !/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(phone.trim())) {
      setFormError('Įveskite teisingą telefono numerį.');
      return;
    }

    if (isDriver && (!carColor.trim() || !carMake.trim() || !carPlate.trim())) {
      setFormError('Užpildykite automobilio markę, spalvą ir valst. numerį.');
      return;
    }

    const parsedPrice = price.trim() === '' ? null : parseFloat(price.replace(',', '.'));
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 10000)) {
      setFormError('Įveskite teisingą kainą.');
      return;
    }

    const payload: NewTrip = {
      role,
      from_location: fromAddr.display_name.trim(),
      to_location: toAddr.display_name.trim(),
      from_lat: fromAddr.lat,
      from_lng: fromAddr.lng,
      to_lat: toAddr.lat,
      to_lng: toAddr.lng,
      departure_time: departure.toISOString(),
      name: name.trim(),
      seats,
      price: parsedPrice,
      price_unit: priceUnit,
      created_by: userId,
      is_recurring: isRecurring,
    };
    if (phone.trim()) payload.phone = phone.trim();
    if (notes.trim()) payload.notes = notes.trim();
    if (isDriver) {
      payload.car_color = carColor.trim();
      payload.car_make = carMake.trim();
      payload.car_plate = carPlate.trim();
    } else {
      payload.baggage = baggage.trim() || null;
    }

    setSubmitting(true);
    let error;
    if (editTrip) {
      ({ error } = await supabase.from('trips').update(payload).eq('id', editTrip.id));
    } else {
      ({ error } = await supabase.from('trips').insert(payload));
    }
    setSubmitting(false);
    if (error) {
      setFormError('Nepavyko išsaugoti skelbimo. Bandykite dar kartą.');
      return;
    }
    onSubmitted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md px-0 sm:px-4">
      <div className="w-full sm:max-w-lg bg-gradient-to-br from-white to-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-slate-900/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-indigo-600 px-5 sm:px-6 pt-5 pb-4 flex items-center justify-between shadow-lg">
          <h2 className="text-lg font-bold text-white">
            {editTrip
              ? 'Redaguoti skelbimą'
              : isDriver
                ? 'Siūlyti pavežėjimą'
                : 'Ieškoti kelionės'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/20 transition-colors"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Iš kur" icon={<MapPin className="w-4 h-4" />}>
              <AddressInput
                value={fromAddr}
                onChange={setFromAddr}
                placeholder="pvz. Vilnius, Centras"
              />
            </Field>
            <Field label="Į kur" icon={<MapPin className="w-4 h-4" />}>
              <AddressInput
                value={toAddr}
                onChange={setToAddr}
                placeholder="pvz. Trakai"
              />
            </Field>
          </div>

          <Field label="Kada važiuojate" icon={<Clock className="w-4 h-4" />}>
            <input
              type="datetime-local"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="form-input"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Jūsų vardas" icon={<User className="w-4 h-4" />}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
            <Field
              label={isDriver ? 'Vietų skaičius' : 'Keleivių skaičius'}
              icon={<Users className="w-4 h-4" />}
            >
              <input
                type="number"
                min={1}
                max={8}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
                className="form-input"
              />
            </Field>
            <Field label="Preliminari kaina, € (nebūtina)" icon={<Euro className="w-4 h-4" />}>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="pvz. 5"
                  className="form-input flex-1"
                />
                <select
                  value={priceUnit}
                  onChange={(e) => setPriceUnit(e.target.value as PriceUnit)}
                  className="form-input w-auto flex-shrink-0"
                >
                  <option value="asmeniui">/ asm.</option>
                  <option value="viso">/ viso</option>
                </select>
              </div>
            </Field>
          </div>

          {isDriver ? (
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2">
                <Car className="w-4 h-4 text-slate-400" />
                Automobilio informacija (privaloma)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={carMake}
                  onChange={(e) => setCarMake(e.target.value)}
                  placeholder="Markė (pvz. VW Golf)"
                  maxLength={50}
                  className="form-input"
                />
                <input
                  type="text"
                  value={carColor}
                  onChange={(e) => setCarColor(e.target.value)}
                  placeholder="Spalva (pvz. raudona)"
                  maxLength={30}
                  className="form-input"
                />
                <input
                  type="text"
                  value={carPlate}
                  onChange={(e) => setCarPlate(e.target.value)}
                  placeholder="Valst. nr. (pvz. ABC123)"
                  maxLength={15}
                  className="form-input"
                />
              </div>
            </div>
          ) : (
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
          )}

          <Field label="Pastabos (nebūtina)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isDriver ? 'pvz. bagažinė laisva, kaina derinama' : 'pvz. važiuoju su vaikų kėdute, kaina derinama'}
              rows={2}
              maxLength={500}
              className="form-input resize-none"
            />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer rounded-xl bg-slate-50 p-3.5">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 flex items-center gap-1.5">
              <Repeat className="w-4 h-4 text-blue-500" />
              Pasikartojantis maršrutas (kasdien / reguliariai)
            </span>
          </label>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-gradient-x"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saugoma…</span>
              </>
            ) : editTrip ? (
              <span>Išsaugoti pakeitimus</span>
            ) : (
              <span>Skelbti</span>
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
