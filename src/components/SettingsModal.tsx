import { useDialogFocus } from '@/lib/useDialogFocus';
import { useEffect, useState } from 'react';
import { Settings, User, Phone, Car, Users, Bell, LogOut, Loader2, Check, Moon, Sun, Globe } from 'lucide-react';
import { supabase, type UserProfile, type TripRole } from '@/lib/supabase';
import { useDarkMode } from '@/lib/useDarkMode';
import { useLanguage } from '@/lib/useLanguage';

type NotificationPrefs = { newRequests: boolean; newMessages: boolean; tripReminders: boolean };
type ProfileWithCar = UserProfile & {
  car_make?: string | null;
  car_color?: string | null;
  car_plate?: string | null;
};

const STORAGE_KEY = 'pavezejimai_settings';
const DEFAULT_PREFS: NotificationPrefs = { newRequests: true, newMessages: true, tripReminders: false };

function loadPrefs(): NotificationPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_PREFS, ...parsed };
  } catch { return DEFAULT_PREFS; }
}

export function SettingsModal({ userId, onClose, onSignOut }: { userId: string; onClose: () => void; onSignOut: () => void }) {
  const dialogRef = useDialogFocus();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultRole, setDefaultRole] = useState<TripRole | ''>('');
  const [carMake, setCarMake] = useState('');
  const [carColor, setCarColor] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs());
  const { language, setLanguage, isEnglish } = useLanguage();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const text = isEnglish ? {
    settings: 'Settings', close: 'Close', loading: 'Loading…', account: 'Account information', name: 'Name', namePlaceholder: 'Your name', phone: 'Phone', email: 'Email', carInfo: 'Car information (fill in if you drive)', make: 'Make', makePlaceholder: 'e.g. VW Golf', color: 'Color', colorPlaceholder: 'e.g. red', plate: 'License plate', platePlaceholder: 'e.g. ABC123', defaultRole: 'Default role', driver: 'Driver', passenger: 'Passenger', notifications: 'Notifications', newRequests: 'New requests', newRequestsDesc: 'Notify about new ride requests', newMessages: 'New messages', newMessagesDesc: 'Notify about new messages', reminders: 'Trip reminders', remindersDesc: 'Remind me before departure', appearance: 'Appearance', darkMode: 'Dark mode', experimental: 'Experimental', darkToggle: 'Toggle dark mode', language: 'Language', languageDesc: 'Choose app language', lithuanian: 'Lithuanian', english: 'English', saving: 'Saving…', saved: 'Saved', save: 'Save changes', signOut: 'Sign out', badPhone: 'Invalid phone number format.', profileLoadError: 'Failed to load profile', profileSaveError: 'Failed to save profile', fallbackUser: 'User',
  } : {
    settings: 'Parametrai', close: 'Uždaryti', loading: 'Įkeliama…', account: 'Paskyros informacija', name: 'Vardas', namePlaceholder: 'Jūsų vardas', phone: 'Telefonas', email: 'El. paštas', carInfo: 'Automobilio informacija (užpildykite, jei vairuotojas)', make: 'Markė', makePlaceholder: 'pvz. VW Golf', color: 'Spalva', colorPlaceholder: 'pvz. raudona', plate: 'Valst. numeris', platePlaceholder: 'pvz. ABC123', defaultRole: 'Numatytasis vaidmuo', driver: 'Vairuotojas', passenger: 'Keleivis', notifications: 'Pranešimai', newRequests: 'Naujos užklausos', newRequestsDesc: 'Pranešti apie naują kelionės užklausą', newMessages: 'Naujos žinutės', newMessagesDesc: 'Pranešti apie naujas žinutes', reminders: 'Kelionės priminimai', remindersDesc: 'Priminti prieš išvykimą', appearance: 'Išvaizda', darkMode: 'Tamsusis režimas', experimental: 'Eksperimentinis', darkToggle: 'Perjungti tamsųjį režimą', language: 'Kalba', languageDesc: 'Pasirinkite programos kalbą', lithuanian: 'Lietuvių', english: 'English', saving: 'Saugoma…', saved: 'Išsaugota', save: 'Išsaugoti pakeitimus', signOut: 'Atsijungti', badPhone: 'Neteisingas telefono formatas.', profileLoadError: 'Nepavyko įkelti profilio', profileSaveError: 'Nepavyko išsaugoti profilio', fallbackUser: 'Vartotojas',
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (!mounted) return;
      if (!error && data?.[0]) {
        const row = data[0] as ProfileWithCar;
        setProfile(row);
        setDisplayName(row.display_name ?? '');
        setPhone(row.phone ?? '');
        setDefaultRole(row.default_role ?? '');
        setCarMake(row.car_make ?? '');
        setCarColor(row.car_color ?? '');
        setCarPlate(row.car_plate ?? '');
      } else if (error) {
        setSaveError(`${text.profileLoadError}: ${error.message}`);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userId, text.profileLoadError]);

  function togglePref(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  async function handleSave() {
    const normalizedPhone = phone.trim();
    if (normalizedPhone && !/^\+?[0-9 ()-]{8,20}$/.test(normalizedPhone)) {
      setSaveError(text.badPhone);
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError('');

    const { error } = await supabase.rpc('update_my_profile', {
      p_display_name: displayName.trim() || text.fallbackUser,
      p_phone: normalizedPhone || null,
      p_default_role: defaultRole || null,
      p_car_make: carMake.trim() || null,
      p_car_color: carColor.trim() || null,
      p_car_plate: carPlate.trim() || null,
    });

    if (error) {
      setSaving(false);
      setSaveError(`${text.profileSaveError}: ${error.message}`);
      return;
    }

    setSaving(false);
    setSaved(true);
    setProfile(current => current ? {
      ...current,
      display_name: displayName.trim() || text.fallbackUser,
      phone: normalizedPhone || null,
      default_role: defaultRole || null,
    } : current);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="modal-panel w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl shadow-overlay max-h-[92dvh] overflow-y-auto" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="SettingsModal-title">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-neutral-700" /><h2 id="SettingsModal-title" className="text-lg font-bold text-neutral-900">{text.settings}</h2></div>
          <button data-dialog-close onClick={onClose} className="ui-button px-4 py-2 rounded-xl bg-neutral-100 text-neutral-600 text-sm font-semibold hover:bg-neutral-200">{text.close}</button>
        </div>

        {loading ? <div className="flex flex-col items-center justify-center py-16 text-neutral-500"><Loader2 className="w-6 h-6 animate-spin mb-2" /><p className="text-sm">{text.loading}</p></div> : (
          <div className="p-5 sm:p-6 space-y-6">
            <section>
              <h3 className="section-title"><User className="w-3.5 h-3.5" /> {text.account}</h3>
              <div className="space-y-3">
                <label className="block"><span className="field-label">{text.name}</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={text.namePlaceholder} className="form-input" /></label>
                <label className="block"><span className="field-label">{text.phone}</span><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" /><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+370 6XX XXXXX" className="form-input pl-10" /></div></label>
                {profile?.email && <label className="block"><span className="field-label">{text.email}</span><input value={profile.email} disabled className="form-input bg-neutral-50 text-neutral-500" /></label>}
              </div>
            </section>

            <section>
              <h3 className="section-title">{text.defaultRole}</h3>
              <div className="grid grid-cols-2 gap-3">
                <RoleButton active={defaultRole === 'driver'} onClick={() => setDefaultRole(defaultRole === 'driver' ? '' : 'driver')} icon={<Car className="w-5 h-5" />} label={text.driver} />
                <RoleButton active={defaultRole === 'passenger'} onClick={() => setDefaultRole(defaultRole === 'passenger' ? '' : 'passenger')} icon={<Users className="w-5 h-5" />} label={text.passenger} />
              </div>
            </section>

            {defaultRole !== 'passenger' && (
              <section>
                <h3 className="section-title"><Car className="w-3.5 h-3.5" /> {text.carInfo}</h3>
                <div className="space-y-3">
                  <label className="block"><span className="field-label">{text.make}</span><input value={carMake} onChange={e => setCarMake(e.target.value)} placeholder={text.makePlaceholder} className="form-input" /></label>
                  <label className="block"><span className="field-label">{text.color}</span><input value={carColor} onChange={e => setCarColor(e.target.value)} placeholder={text.colorPlaceholder} className="form-input" /></label>
                  <label className="block"><span className="field-label">{text.plate}</span><input value={carPlate} onChange={e => setCarPlate(e.target.value)} placeholder={text.platePlaceholder} className="form-input" /></label>
                </div>
              </section>
            )}

            <section>
              <h3 className="section-title"><Bell className="w-3.5 h-3.5" /> {text.notifications}</h3>
              <div className="space-y-1">
                <ToggleRow label={text.newRequests} description={text.newRequestsDesc} checked={prefs.newRequests} onChange={() => togglePref('newRequests')} />
                <ToggleRow label={text.newMessages} description={text.newMessagesDesc} checked={prefs.newMessages} onChange={() => togglePref('newMessages')} />
                <ToggleRow label={text.reminders} description={text.remindersDesc} checked={prefs.tripReminders} onChange={() => togglePref('tripReminders')} />
              </div>
            </section>

            <section>
              <h3 className="section-title">{text.appearance}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50 border border-neutral-200"><div className="flex items-center gap-3">{isDark ? <Moon className="w-5 h-5 text-neutral-600" /> : <Sun className="w-5 h-5 text-neutral-500" />}<div><p className="text-sm font-medium text-neutral-700">{text.darkMode}</p><p className="text-xs text-neutral-500">{text.experimental}</p></div></div><button role="switch" aria-checked={isDark} aria-label={text.darkToggle} onClick={toggleDarkMode} className={`ui-switch relative w-11 h-6 rounded-full transition-colors ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow-sm transition-transform ${isDark ? 'translate-x-5' : ''}`} /></button></div>
                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200"><div className="flex items-center gap-3 mb-3"><Globe className="w-5 h-5 text-neutral-600" /><div><p className="text-sm font-medium text-neutral-700">{text.language}</p><p className="text-xs text-neutral-500">{text.languageDesc}</p></div></div><div className="grid grid-cols-2 gap-2"><button onClick={() => setLanguage('lt')} className={`ui-button py-2.5 px-4 rounded-xl text-sm font-semibold ${language === 'lt' ? 'bg-primary-600 text-on-primary' : 'bg-surface text-neutral-600 border border-neutral-200'}`}>{text.lithuanian}</button><button onClick={() => setLanguage('en')} className={`ui-button py-2.5 px-4 rounded-xl text-sm font-semibold ${language === 'en' ? 'bg-primary-600 text-on-primary' : 'bg-surface text-neutral-600 border border-neutral-200'}`}>{text.english}</button></div></div>
              </div>
            </section>

            {saveError && <div role="alert" className="rounded-2xl bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700 break-words">{saveError}</div>}
            <button onClick={handleSave} disabled={saving} className="ui-button w-full py-3 rounded-xl bg-primary-600 text-on-primary font-semibold hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {text.saving}</> : saved ? <><Check className="w-4 h-4" /> {text.saved}</> : text.save}</button>
            <div className="pt-2 border-t border-neutral-100"><button onClick={onSignOut} className="ui-button w-full py-3 rounded-xl bg-neutral-100 text-neutral-700 font-semibold hover:bg-neutral-200 flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> {text.signOut}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button aria-pressed={active} onClick={onClick} className={`ui-button flex min-w-0 flex-col sm:flex-row items-center gap-2 p-3 rounded-xl border transition-all ${active ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-surface hover:border-neutral-300'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-primary-600 text-on-primary' : 'bg-neutral-100 text-neutral-500'}`}>{icon}</div><span className={`text-sm font-semibold ${active ? 'text-primary-700' : 'text-neutral-600'}`}>{label}</span></button>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-neutral-50"><div className="flex-1 min-w-0 mr-3"><p className="text-sm font-medium text-neutral-700">{label}</p><p className="text-xs text-neutral-500 mt-0.5">{description}</p></div><button role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`ui-switch relative w-11 h-6 rounded-full flex-shrink-0 ${checked ? 'bg-primary-600' : 'bg-neutral-300'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow-sm ${checked ? 'translate-x-5' : ''}`} /></button></div>;
}
