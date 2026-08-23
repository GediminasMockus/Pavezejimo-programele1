import { useEffect, useState } from 'react';
import { Settings, User, Phone, Car, Users, Bell, LogOut, Loader2, Check, Moon, Sun } from 'lucide-react';
import { supabase, type UserProfile, type TripRole } from '@/lib/supabase';
import { useDarkMode } from '@/lib/useDarkMode';

type NotificationPrefs = {
  newRequests: boolean;
  newMessages: boolean;
  tripReminders: boolean;
};

const STORAGE_KEY = 'pavezejimai_settings';

function loadLocalPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultPrefs();
}

function defaultPrefs(): NotificationPrefs {
  return { newRequests: true, newMessages: true, tripReminders: false };
}

function saveLocalPrefs(prefs: NotificationPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function SettingsModal({
  userId,
  onClose,
  onSignOut,
}: {
  userId: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultRole, setDefaultRole] = useState<TripRole | ''>('');
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadLocalPrefs);
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setDisplayName(data.display_name ?? '');
          setPhone(data.phone ?? '');
          setDefaultRole(data.default_role ?? '');
        }
        setLoading(false);
      });
  }, [userId]);

  function togglePref(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveLocalPrefs(next);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const updates: Record<string, unknown> = {
      display_name: displayName.trim() || 'Vartotojas',
      phone: phone.trim() || null,
      default_role: defaultRole || null,
    };
    let error;
    if (profile) {
      ({ error } = await supabase.from('user_profiles').update(updates).eq('id', userId));
    } else {
      ({ error } = await supabase.from('user_profiles').insert({
        id: userId,
        ...updates,
        total_ratings: 0,
        avg_rating: 0,
      }));
    }
    setSaving(false);
    if (error) {
      alert('Nepavyko išsaugoti pakeitimų. Bandykite dar kartą.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Parametrai</h2>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors"
          >
            Uždaryti
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <p className="text-sm">Įkeliama…</p>
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Profile section */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Paskyros informacija
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Vardas</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jūsų vardas"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Telefonas</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+370 6XX XXXXX"
                      className="form-input pl-10"
                    />
                  </div>
                  {phone && !/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(phone.trim()) && (
                    <p className="text-xs text-red-500 mt-1">Neteisingas telefono formatas</p>
                  )}
                </div>
                {profile?.email && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">El. paštas</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="form-input bg-slate-50 text-slate-400 cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Default role */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Numatytasis vaidmuo
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDefaultRole(defaultRole === 'driver' ? '' : 'driver')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    defaultRole === 'driver'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    defaultRole === 'driver' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Car className="w-5 h-5" />
                  </div>
                  <span className={`text-sm font-semibold ${defaultRole === 'driver' ? 'text-blue-700' : 'text-slate-600'}`}>
                    Vairuotojas
                  </span>
                </button>
                <button
                  onClick={() => setDefaultRole(defaultRole === 'passenger' ? '' : 'passenger')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    defaultRole === 'passenger'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    defaultRole === 'passenger' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Users className="w-5 h-5" />
                  </div>
                  <span className={`text-sm font-semibold ${defaultRole === 'passenger' ? 'text-emerald-700' : 'text-slate-600'}`}>
                    Keleivis
                  </span>
                </button>
              </div>
            </section>

            {/* Notifications */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                Pranešimai
              </h3>
              <div className="space-y-1">
                <ToggleRow
                  label="Naujos užklausos"
                  description="Pranešti, kai gaunate naują kelionės užklausą"
                  checked={prefs.newRequests}
                  onChange={() => togglePref('newRequests')}
                />
                <ToggleRow
                  label="Naujos žinutės"
                  description="Pranešti apie naujas žinutes pokalbyje"
                  checked={prefs.newMessages}
                  onChange={() => togglePref('newMessages')}
                />
                <ToggleRow
                  label="Kelionės priminimai"
                  description="Priminti prieš išvykimą"
                  checked={prefs.tripReminders}
                  onChange={() => togglePref('tripReminders')}
                />
              </div>
            </section>

            {/* Appearance */}
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Išvaizda
              </h3>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3">
                  {isDark ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-amber-500" />}
                  <div>
                    <p className="text-sm font-medium text-slate-700">Tamsusis režimas</p>
                    <p className="text-xs text-slate-400">Eksperimentinis</p>
                  </div>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isDark ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </section>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/25 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saugoma…</>
              ) : saved ? (
                <><Check className="w-4 h-4" /> Išsaugota</>
              ) : (
                'Išsaugoti pakeitimus'
              )}
            </button>

            {/* Sign out */}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={onSignOut}
                className="w-full py-3 rounded-2xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Atsijungti
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
