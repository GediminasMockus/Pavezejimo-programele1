import { useDialogFocus } from '@/lib/useDialogFocus';
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
  initialSearch,
  onClose,
  onSubmitted,
}: {
  role: TripRole;
  userId: string;
  editTrip?: Trip | null;
  initialSearch?: { fromLocation: string; toLocation: string; date: string };
  onClose: () => void;
  onSubmitted: (trip?: Trip) => void;
}) {
  const dialogRef = useDialogFocus();
  const isDriver = role === 'driver';

  const [fromAddr, setFromAddr] = useState<AddressValue>({
    display_name: editTrip?.from_location ?? initialSearch?.fromLocation ?? '',
    lat: editTrip?.from_lat ?? null,
    lng: editTrip?.from_lng ?? null,
  });
  const [toAddr, setToAddr] = useState<AddressValue>({
    display_name: editTrip?.to_location ?? initialSearch?.toLocation ?? '',
    lat: editTrip?.to_lat ?? null,
    lng: editTrip?.to_lng ?? null,
  });
  const [departureTime, setDepartureTime] = useState(
    editTrip
      ? toLocalInput(new Date(editTrip.departure_time))
      : initialSearch?.date ? initialSearch.date + 'T12:00' : toLocalInput(new Date(Date.now() + 3600_000)),
  );
  const [fromArea, setFromArea] = useState(editTrip?.from_area ?? initialSearch?.fromLocation ?? '');
  const [toArea, setToArea] = useState(editTrip?.to_area ?? initialSearch?.toLocation ?? '');
  const [name, setName] = useState(editTrip?.name ?? '');
  const [phone, setPhone] = useState(editTrip?.phone ?? '');
  const [seats, setSeats] = useState<number | ''>(editTrip?.seats ?? 1);
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
    supabase.rpc('get_my_profile').then(({ data }) => {
      const profileData = data?.[0];
      if (profileData?.display_name) setName(profileData.display_name);
      if (profileData?.phone) setPhone(profileData.phone);
      // Load car fields from profile for drivers
      if (isDriver) {
        if (profileData?.car_make) setCarMake(profileData.car_make);
        if (profileData?.car_color) setCarColor(profileData.car_color);
        if (profileData?.car_plate) setCarPlate(profileData.car_plate);
      }
    });
  }, [userId, editTrip, isDriver]);

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

    if (seats === '' || !Number.isInteger(seats) || seats < 1 || seats > 8) {
      setFormError('Vietų skaičius turi būti nuo 1 iki 8.');
      return;
    }

    if (name.trim().length > 80 || fromAddr.display_name.trim().length > 160 || toAddr.display_name.trim().length > 160 || notes.trim().length > 500) {
      setFormError('Kai kurie laukai per ilgi. Sutrumpinkite tekstą.');
      return;
    }

    if (phone.trim() && !/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(phone.trim())) {
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

    if (!fromArea.trim() || !toArea.trim()) { setFormError("Nurodykite viešai rodomus miestus arba vietoves."); return; }
    const payload: NewTrip = {
      from_area: fromArea.trim(), to_area: toArea.trim(),
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
    payload.phone = phone.trim();
    payload.notes = notes.trim();
    if (isDriver) {
      payload.car_color = carColor.trim();
      payload.car_make = carMake.trim();
      payload.car_plate = carPlate.trim();
    } else {
      payload.baggage = baggage.trim() || null;
    }

    setSubmitting(true);
    let error;
    let savedTrip: Trip | undefined;
    if (editTrip) {
      const result = await supabase.rpc('update_my_trip', {
        p_trip_id: editTrip.id,
        p_trip: payload,
      });
      error = result.error;
      savedTrip = (Array.isArray(result.data) ? result.data[0] : result.data) as Trip | undefined;
    } else {
      const result = await supabase.rpc('create_my_trip', { p_trip: payload });
      error = result.error;
      savedTrip = (Array.isArray(result.data) ? result.data[0] : result.data) as Trip | undefined;
    }
    setSubmitting(false);
    if (error) {
      setFormError(error.message.includes('active requests') ? 'Skelbimas turi aktyvių užklausų. Prieš redaguodami jas užbaikite arba atšaukite.' : 'Nepavyko išsaugoti skelbimo. Patikrinkite laukus ir bandykite dar kartą.');
      return;
    }
    if (savedTrip?.id) {
      void supabase.functions.invoke('corridor-match', { body: { action: 'notify', tripId: savedTrip.id } });
    }
    onSubmitted(savedTrip);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none bg-overlay/50 backdrop-blur-md px-0 sm:px-4">
      <div className="modal-panel ride-dialog w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-overlay max-h-[92dvh] overflow-hidden flex flex-col" data-role={isDriver ? 'driver' : 'passenger'} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="TripForm-title">
        <div className="modal-header">
          <h2 id="TripForm-title" className="text-lg font-semibold text-neutral-900">
            {editTrip
              ? 'Redaguoti skelbimą'
              : isDriver
                ? 'Siūlyti pavežėjimą'
                : 'Ieškoti kelionės'}
          </h2>
          <button
            data-dialog-close onClick={onClose}
            className="icon-button"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Iš kur" inputId="trip-from" icon={<MapPin className="w-4 h-4" />}>
              <AddressInput
                id="trip-from"
                value={fromAddr}
                onChange={value => {
                  setFromAddr(value);
                  if (value.area) {
                    setFromArea(value.area);
                  } else {
                    // Extract city from manual input
                    const cityMatch = value.display_name.match(/^([^,]+)/);
                    if (cityMatch) setFromArea(cityMatch[1].trim());
                  }
                }}
                placeholder="pvz. Vilnius, Centras"
              />
            </Field>
            <Field label="Į kur" inputId="trip-to" icon={<MapPin className="w-4 h-4" />}>
              <AddressInput
                id="trip-to"
                value={toAddr}
                onChange={value => {
                  setToAddr(value);
                  if (value.area) {
                    setToArea(value.area);
                  } else {
                    // Extract city from manual input
                    const cityMatch = value.display_name.match(/^([^,]+)/);
                    if (cityMatch) setToArea(cityMatch[1].trim());
                  }
                }}
                placeholder="pvz. Trakai"
              />
            </Field>
          </div>

          <Field label="Kada važiuojate" inputId="trip-departure" icon={<Clock className="w-4 h-4" />}>
            <input
              id="trip-departure"
              type="datetime-local"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="form-input"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Jūsų vardas" inputId="trip-name" icon={<User className="w-4 h-4" />}>
              <input
                id="trip-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="pvz. Jonas"
                maxLength={80}
                className="form-input"
              />
            </Field>
            <Field label="Telefonas (nebūtina)" inputId="trip-phone" icon={<Phone className="w-4 h-4" />}>
              <input
                id="trip-phone"
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
              inputId="trip-seats"
              icon={<Users className="w-4 h-4" />}
            >
              <input
                id="trip-seats"
                type="number"
                min={1}
                max={8}
                value={seats}
                onChange={(e) => setSeats(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => {
                  if (seats !== '' && (seats < 1 || seats > 8)) setSeats(Math.min(8, Math.max(1, seats)));
                }}
                className="form-input"
              />
            </Field>
            <Field label="Preliminari kaina, € (nebūtina)" inputId="trip-price" icon={<Euro className="w-4 h-4" />}>
              <div className="flex gap-2">
                <input
                  id="trip-price"
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="pvz. 5"
                  className="form-input flex-1"
                />
                <select
                  aria-label="Kainos vienetas"
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
              <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-2">
                <Car className="w-4 h-4 text-neutral-500" />
                Automobilio informacija (privaloma)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  aria-label="Automobilio markė"
                  type="text"
                  value={carMake}
                  onChange={(e) => setCarMake(e.target.value)}
                  placeholder="Markė (pvz. VW Golf)"
                  maxLength={50}
                  className="form-input"
                />
                <input
                  aria-label="Automobilio spalva"
                  type="text"
                  value={carColor}
                  onChange={(e) => setCarColor(e.target.value)}
                  placeholder="Spalva (pvz. raudona)"
                  maxLength={30}
                  className="form-input"
                />
                <input
                  aria-label="Automobilio valstybinis numeris"
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
            <Field label="Bagažas" inputId="trip-baggage" icon={<Briefcase className="w-4 h-4" />}>
              <select
                id="trip-baggage"
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

          <Field label="Pastabos (nebūtina)" inputId="trip-notes">
            <textarea
              id="trip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isDriver ? 'pvz. bagažinė laisva, kaina derinama' : 'pvz. važiuoju su vaikų kėdute, kaina derinama'}
              rows={2}
              maxLength={500}
              className="form-input resize-none"
            />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer rounded-xl bg-neutral-50 p-3.5">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-primary-700 focus:ring-primary-500"
            />
            <span className="text-sm text-neutral-600 flex items-center gap-1.5">
              <Repeat className="w-4 h-4 text-primary-500" />
              Pasikartojantis maršrutas (kasdien / reguliariai)
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-sm">Išvykimo vieta (vieša)<input className="form-input" value={fromArea} onChange={e => setFromArea(e.target.value)} maxLength={100} /></label><label className="text-sm">Atvykimo vieta (vieša)<input className="form-input" value={toArea} onChange={e => setToArea(e.target.value)} maxLength={100} /></label></div>
          <p className="text-xs text-neutral-500">Automatiškai įrašoma gatvė, rajonas ir miestas be namo numerio. Jei norite, viešą vietą galite dar labiau sutrumpinti. Tikslų adresą ir kontaktus matys tik patvirtintos kelionės dalyviai.</p>
          {formError && (
            <p className="text-sm text-danger-700 bg-danger-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="ui-button mt-2 w-full py-3.5 rounded-xl bg-primary-600 text-on-primary font-semibold shadow-card hover:shadow-card active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 "
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saugoma…</span>
              </>
            ) : editTrip ? (
              <span>Išsaugoti pakeitimus</span>
            ) : (
              <span>Paskelbti skelbimą</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  inputId,
  icon,
  children,
}: {
  label: string;
  inputId: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-2">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
