import { useEffect, useState } from 'react';
import { Settings, User, Phone, Car, Users, Bell, LogOut, Loader2, Check, Moon, Sun, Globe } from 'lucide-react';
import { supabase, type UserProfile, type TripRole } from '@/lib/supabase';
import { useDarkMode } from '@/lib/useDarkMode';

type NotificationPrefs = { newRequests: boolean; newMessages: boolean; tripReminders: boolean };
type Language = 'lt' | 'en';

const STORAGE_KEY = 'pavezejimai_settings';
const LANGUAGE_KEY = 'pavezejimai_language';
const DEFAULT_PREFS: NotificationPrefs = { newRequests: true, newMessages: true, tripReminders: false };

function loadPrefs(): NotificationPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_PREFS, ...parsed };
  } catch { return DEFAULT_PREFS; }
}

function loadLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'lt';
  } catch { return 'lt'; }
}

export function SettingsModal({ userId, onClose, onSignOut }: { userId: string; onClose: () => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultRole, setDefaultRole] = useState<TripRole | ''>('');
  const [carMake, setCarMake] = useState('');
  const [carColor, setCarColor] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs());
  const [language, setLanguage] = useState<Language>(loadLanguage());
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (!mounted) return;
      if (!error && data?.[0]) {
        const row = data[0] as any;
        setProfile(row);
        setDisplayName(row.display_name ?? '');
        setPhone(row.phone ?? '');
        setDefaultRole(row.default_role ?? '');
        setCarMake(row.car_make ?? '');
        setCarColor(row.car_color ?? '');
        setCarPlate(row.car_plate ?? '');
      } else if (error) {
        setSaveError(`Nepavyko įkelti profilio: ${error.message}`);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userId]);

  function togglePref(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function changeLanguage(value: Language) {
    setLanguage(value);
    try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* ignore */ }
  }

  async function handleSave() {
    const normalizedPhone = phone.trim();
    if (normalizedPhone && !/^\+?[0-9 ()-]{8,20}$/.test(normalizedPhone)) {
      setSaveError('Neteisingas telefono formatas.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError('');

    const { error } = await supabase.rpc('update_my_profile', {
      p_display_name: displayName.trim() || 'Vartotojas',
      p_phone: normalizedPhone || null,
      p_default_role: defaultRole || null,
      p_car_make: carMake.trim() || null,
      p_car_color: carColor.trim() || null,
      p_car_plate: carPlate.trim() || null,
    });

    if (error) {
      setSaving(false);
      setSaveError(`Nepavyko išsaugoti profilio: ${error.message}`);
      return;
    }

    setSaving(false);
    setSaved(true);
    setProfile(current => current ? {
      ...current,
      display_name: displayName.trim() || 'Vartotojas',
      phone: normalizedPhone || null,
      default_role: defaultRole || null,
    } : current);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-slate-700" /><h2 className="text-lg font-bold text-slate-900">Parametrai</h2></div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200">Uždaryti</button>
        </div>

        {loading ? <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mb-2" /><p className="text-sm">Įkeliama…</p></div> : (
          <div className="p-5 sm:p-6 space-y-6">
            <section>
              <h3 className="section-title"><User className="w-3.5 h-3.5" /> Paskyros informacija</h3>
              <div className="space-y-3">
                <label className="block"><span className="field-label">Vardas</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jūsų vardas" className="form-input" /></label>
                <label className="block"><span className="field-label">Telefonas</span><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+370 6XX XXXXX" className="form-input pl-10" /></div></label>
                {profile?.email && <label className="block"><span className="field-label">El. paštas</span><input value={profile.email} disabled className="form-input bg-slate-50 text-slate-400" /></label>}
              </div>
            </section>

            <section>
              <h3 className="section-title"><Car className="w-3.5 h-3.5" /> Automobilio informacija (užpildykite, jei vairuotojas)</h3>
              <div className="space-y-3">
                <label className="block"><span className="field-label">Markė</span><input value={carMake} onChange={e => setCarMake(e.target.value)} placeholder="pvz. VW Golf" className="form-input" /></label>
                <label className="block"><span className="field-label">Spalva</span><input value={carColor} onChange={e => setCarColor(e.target.value)} placeholder="pvz. raudona" className="form-input" /></label>
                <label className="block"><span className="field-label">Valst. numeris</span><input value={carPlate} onChange={e => setCarPlate(e.target.value)} placeholder="pvz. ABC123" className="form-input" /></label>
              </div>
            </section>

            <section>
              <h3 className="section-title">Numatytasis vaidmuo</h3>
              <div className="grid grid-cols-2 gap-3">
                <RoleButton active={defaultRole === 'driver'} onClick={() => setDefaultRole(defaultRole === 'driver' ? '' : 'driver')} icon={<Car className="w-5 h-5" />} label="Vairuotojas" />
                <RoleButton active={defaultRole === 'passenger'} passenger onClick={() => setDefaultRole(defaultRole === 'passenger' ? '' : 'passenger')} icon={<Users className="w-5 h-5" />} label="Keleivis" />
              </div>
            </section>

            <section>
              <h3 className="section-title"><Bell className="w-3.5 h-3.5" /> Pranešimai</h3>
              <div className="space-y-1">
                <ToggleRow label="Naujos užklausos" description="Pranešti apie naują kelionės užklausą" checked={prefs.newRequests} onChange={() => togglePref('newRequests')} />
                <ToggleRow label="Naujos žinutės" description="Pranešti apie naujas žinutes" checked={prefs.newMessages} onChange={() => togglePref('newMessages')} />
                <ToggleRow label="Kelionės priminimai" description="Priminti prieš išvykimą" checked={prefs.tripReminders} onChange={() => togglePref('tripReminders')} />
              </div>
            </section>

            <section>
              <h3 className="section-title">Išvaizda</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200"><div className="flex items-center gap-3">{isDark ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-amber-500" />}<div><p className="text-sm font-medium text-slate-700">Tamsusis režimas</p><p className="text-xs text-slate-400">Eksperimentinis</p></div></div><button aria-label="Perjungti tamsųjį režimą" onClick={toggleDarkMode} className={`relative w-11 h-6 rounded-full transition-colors ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isDark ? 'translate-x-5' : ''}`} /></button></div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200"><div className="flex items-center gap-3 mb-3"><Globe className="w-5 h-5 text-slate-600" /><div><p className="text-sm font-medium text-slate-700">Kalba</p><p className="text-xs text-slate-400">Pasirinkite programos kalbą</p></div></div><div className="grid grid-cols-2 gap-2"><button onClick={() => changeLanguage('lt')} className={`py-2.5 px-4 rounded-xl text-sm font-semibold ${language === 'lt' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Lietuvių</button><button onClick={() => changeLanguage('en')} className={`py-2.5 px-4 rounded-xl text-sm font-semibold ${language === 'en' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>English</button></div></div>
              </div>
            </section>

            {saveError && <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 break-words">{saveError}</div>}
            <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saugoma…</> : saved ? <><Check className="w-4 h-4" /> Išsaugota</> : 'Išsaugoti pakeitimus'}</button>
            <div className="pt-2 border-t border-slate-100"><button onClick={onSignOut} className="w-full py-3 rounded-2xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> Atsijungti</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleButton({ active, passenger, onClick, icon, label }: { active: boolean; passenger?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${active ? (passenger ? 'border-emerald-500 bg-emerald-50' : 'border-blue-500 bg-blue-50') : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? (passenger ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-100 text-slate-400'}`}>{icon}</div><span className={`text-sm font-semibold ${active ? (passenger ? 'text-emerald-700' : 'text-blue-700') : 'text-slate-600'}`}>{label}</span></button>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50"><div className="flex-1 min-w-0 mr-3"><p className="text-sm font-medium text-slate-700">{label}</p><p className="text-xs text-slate-400 mt-0.5">{description}</p></div><button aria-label={label} onClick={onChange} className={`relative w-11 h-6 rounded-full flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm ${checked ? 'translate-x-5' : ''}`} /></button></div>;
}
