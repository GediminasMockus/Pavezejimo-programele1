import { useEffect, useState } from 'react';
import { Car, Users, Route, Bell, Shield, LogOut, Settings as SettingsIcon, ArrowRight, Search, AlertCircle, List } from 'lucide-react';
import { supabase, type TripRole } from '@/lib/supabase';
import { emptyFilters, type FilterState } from '@/lib/tripFilters';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useLanguage } from '@/lib/useLanguage';
import { AdminLogs } from './AdminLogs';
import { SettingsModal } from './SettingsModal';
import { NotificationDrawer } from './NotificationDrawer';

export function HomeScreen({ userId, onPick, onSignOut }: { userId: string; onPick: (role: TripRole, filters?: FilterState, create?: boolean) => void; onSignOut: () => void }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const unreadCount = useUnreadCount(userId);
  const [mode, setMode] = useState<TripRole>('passenger');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [searchError, setSearchError] = useState('');
  const { isEnglish } = useLanguage();

  const text = isEnglish ? {
    notifications: 'Notifications', settings: 'Settings', admin: 'Administration', signOut: 'Sign out', badge: 'Intercity rides', title1: 'Find someone', title2: 'going your way.', intro: 'Enter your route and time. We will show the most relevant rides or passengers.', need: 'Choose what you want to do', start: 'Plan your ride', looking: 'I need a ride', driving: 'I drive', from: 'From', to: 'To', when: 'When', findRide: 'Find rides', publishRide: 'Publish my ride', hint: 'You can change filters later.', browseAll: 'Browse all available rides', browseHint: 'No exact route in mind?', fromPlaceholder: 'City or pickup area', toPlaceholder: 'City or destination', optional: 'Optional', routeRequired: 'Enter both the departure and destination before searching.',
  } : {
    notifications: 'Pranešimai', settings: 'Nustatymai', admin: 'Administracija', signOut: 'Atsijungti', badge: 'Pavežėjimai tarp miestų', title1: 'Rask žmogų,', title2: 'važiuojantį tavo kryptimi.', intro: 'Įvesk maršrutą ir laiką. Parodysime tinkamiausias keliones arba keleivius.', need: 'Pasirink, ką nori daryti', start: 'Suplanuok kelionę', looking: 'Ieškau kelionės', driving: 'Vežu keleivius', from: 'Iš kur', to: 'Į kur', when: 'Kada', findRide: 'Rasti keliones', publishRide: 'Paskelbti savo kelionę', hint: 'Filtrus galėsi pakeisti ir vėliau.', browseAll: 'Peržiūrėti visas keliones', browseHint: 'Neturi tikslaus maršruto?', fromPlaceholder: 'Miestas arba paėmimo vieta', toPlaceholder: 'Miestas arba kelionės tikslas', optional: 'Nebūtina', routeRequired: 'Prieš paiešką nurodyk ir išvykimo, ir atvykimo vietą.',
  };

  useEffect(() => {
    document.body.classList.remove('ride-search-focused');
  }, []);

  useEffect(() => {
    supabase.rpc('get_my_profile_flags').then(({ data }) => setIsAdmin(data?.[0]?.is_admin === true));
  }, [userId]);

  const pick = (role: TripRole, filters?: FilterState, create = false) => {
    try { localStorage.setItem('pavezejimai_filters', JSON.stringify(filters ?? emptyFilters)); } catch { /* continue */ }
    if (role === 'driver' || create) document.body.classList.remove('ride-search-focused');
    onPick(role, filters, create);
  };

  const openPassengerResults = (filters: FilterState) => {
    try { localStorage.setItem('viewMode', 'list'); } catch { /* continue */ }
    document.body.classList.add('ride-search-focused');
    pick('passenger', filters);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedFrom = from.trim();
    const normalizedTo = to.trim();

    if (!normalizedFrom || !normalizedTo) {
      setSearchError(text.routeRequired);
      return;
    }

    setSearchError('');
    const filters = { ...emptyFilters, fromLocation: normalizedFrom, toLocation: normalizedTo, date };
    if (mode === 'passenger') openPassengerResults(filters);
    else pick('driver', filters, true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5">
        <button onClick={() => setShowNotifications(true)} className="touch-target relative rounded-xl bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={text.notifications}><Bell className="w-5 h-5" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
        <button onClick={() => setShowSettings(true)} className="touch-target rounded-xl bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={text.settings}><SettingsIcon className="w-5 h-5" /></button>
        {isAdmin && <button onClick={() => setShowAdmin(true)} className="touch-target rounded-xl bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={text.admin}><Shield className="w-5 h-5" /></button>}
        <button onClick={onSignOut} className="touch-target rounded-xl bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-red-600 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" aria-label={text.signOut}><LogOut className="w-5 h-5" /></button>
      </div>
      {showSettings && <SettingsModal userId={userId} onClose={() => setShowSettings(false)} onSignOut={onSignOut} />}
      {showAdmin && <AdminLogs onClose={() => setShowAdmin(false)} />}
      {showNotifications && <NotificationDrawer userId={userId} onClose={() => setShowNotifications(false)} />}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-7 lg:gap-12 items-center min-h-[calc(100vh-7rem)]">
          <section className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/85 border border-slate-200 px-3 py-1.5 shadow-sm mb-4"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{text.badge}</span></div>
            <div className="flex justify-center lg:justify-start mb-4"><div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center"><Route className="w-6 h-6 sm:w-7 sm:h-7 text-white" strokeWidth={2.2} /></div></div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.06]">{text.title1}<span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{text.title2}</span></h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">{text.intro}</p>
          </section>

          <section className="w-full max-w-xl lg:ml-auto" aria-label={text.start}>
            <form onSubmit={submit} className="bg-white/95 backdrop-blur rounded-[24px] sm:rounded-[28px] border border-slate-200 shadow-xl shadow-slate-900/10 overflow-hidden">
              <div className="p-4 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{text.need}</p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">{text.start}</h2>

                <div className="grid grid-cols-2 gap-2 mt-4" role="group" aria-label={text.need}>
                  <button type="button" aria-pressed={mode === 'passenger'} onClick={() => { setMode('passenger'); setSearchError(''); }} className={`min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === 'passenger' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><Users className="w-4 h-4 inline mr-1.5" />{text.looking}</button>
                  <button type="button" aria-pressed={mode === 'driver'} onClick={() => { setMode('driver'); setSearchError(''); }} className={`min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === 'driver' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><Car className="w-4 h-4 inline mr-1.5" />{text.driving}</button>
                </div>

                <div className="space-y-3 mt-5">
                  <label className="block" htmlFor="ride-from-location"><span className="block text-sm font-semibold text-slate-700 mb-1.5">{text.from}</span><input id="ride-from-location" name="ride-from-location" autoComplete="section-origin address-level2" value={from} onChange={e => { setFrom(e.target.value); if (searchError) setSearchError(''); }} aria-invalid={Boolean(searchError && !from.trim())} placeholder={text.fromPlaceholder} className={`form-input min-h-12 text-base ${searchError && !from.trim() ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`} /></label>
                  <label className="block" htmlFor="ride-to-location"><span className="block text-sm font-semibold text-slate-700 mb-1.5">{text.to}</span><input id="ride-to-location" name="ride-to-location" autoComplete="section-destination address-level2" value={to} onChange={e => { setTo(e.target.value); if (searchError) setSearchError(''); }} aria-invalid={Boolean(searchError && !to.trim())} placeholder={text.toPlaceholder} className={`form-input min-h-12 text-base ${searchError && !to.trim() ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`} /></label>
                  <label className="block"><span className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-1.5"><span>{text.when}</span><span className="text-xs font-normal text-slate-500">{text.optional}</span></span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input min-h-12 text-base" /></label>
                </div>

                {searchError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{searchError}</span></div>}

                <button type="submit" className="mt-5 w-full min-h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white py-3.5 px-5 font-extrabold text-base shadow-lg shadow-blue-500/20 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 flex items-center justify-center gap-2">{mode === 'passenger' ? <Search className="w-5 h-5" /> : <Car className="w-5 h-5" />}{mode === 'passenger' ? text.findRide : text.publishRide}<ArrowRight className="w-5 h-5" /></button>
                <p className="text-center text-xs text-slate-500 mt-2.5">{text.hint}</p>

                {mode === 'passenger' && (
                  <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-sm text-slate-500">{text.browseHint}</span>
                    <button
                      type="button"
                      onClick={() => openPassengerResults(emptyFilters)}
                      className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <List className="w-4 h-4" />
                      {text.browseAll}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
