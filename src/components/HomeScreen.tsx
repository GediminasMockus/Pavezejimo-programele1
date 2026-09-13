import { useEffect, useState } from 'react';
import { Car, Users, Route, Bell, Shield, LogOut, Settings as SettingsIcon, ArrowRight, Search } from 'lucide-react';
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
  const { isEnglish } = useLanguage();

  const text = isEnglish ? {
    notifications: 'Notifications', settings: 'Settings', admin: 'Administration', signOut: 'Sign out', badge: 'Intercity rides', title1: 'Find someone', title2: 'going your way.', intro: 'Enter your route and time. We will show the most relevant rides or passengers.', need: 'Choose what you want to do', start: 'Plan your ride', looking: 'I need a ride', driving: 'I drive', from: 'From', to: 'To', when: 'When', findRide: 'Find rides', publishRide: 'Publish my ride', hint: 'You can change filters later.', createOffer: 'Publish a driver ride', findOffers: 'Browse available rides', fromPlaceholder: 'City or pickup area', toPlaceholder: 'City or destination', optional: 'Optional',
  } : {
    notifications: 'Pranešimai', settings: 'Nustatymai', admin: 'Administracija', signOut: 'Atsijungti', badge: 'Pavežėjimai tarp miestų', title1: 'Rask žmogų,', title2: 'važiuojantį tavo kryptimi.', intro: 'Įvesk maršrutą ir laiką. Parodysime tinkamiausias keliones arba keleivius.', need: 'Pasirink, ką nori daryti', start: 'Suplanuok kelionę', looking: 'Ieškau kelionės', driving: 'Vežu keleivius', from: 'Iš kur', to: 'Į kur', when: 'Kada', findRide: 'Rasti keliones', publishRide: 'Paskelbti savo kelionę', hint: 'Filtrus galėsi pakeisti ir vėliau.', createOffer: 'Paskelbti vairuotojo kelionę', findOffers: 'Peržiūrėti esamas keliones', fromPlaceholder: 'Miestas arba paėmimo vieta', toPlaceholder: 'Miestas arba kelionės tikslas', optional: 'Nebūtina',
  };

  useEffect(() => {
    supabase.rpc('get_my_profile_flags').then(({ data }) => setIsAdmin(data?.[0]?.is_admin === true));
  }, [userId]);

  const pick = (role: TripRole, filters?: FilterState, create = false) => {
    try { localStorage.removeItem('pavezejimai_filters'); } catch { /* continue */ }
    onPick(role, filters, create);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    pick(mode, { ...emptyFilters, fromLocation: from.trim(), toLocation: to.trim(), date }, mode === 'driver');
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
                  <button type="button" aria-pressed={mode === 'passenger'} onClick={() => setMode('passenger')} className={`min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === 'passenger' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><Users className="w-4 h-4 inline mr-1.5" />{text.looking}</button>
                  <button type="button" aria-pressed={mode === 'driver'} onClick={() => setMode('driver')} className={`min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === 'driver' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><Car className="w-4 h-4 inline mr-1.5" />{text.driving}</button>
                </div>

                <div className="space-y-3 mt-5">
                  <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1.5">{text.from}</span><input autoComplete="address-level2" value={from} onChange={e => setFrom(e.target.value)} placeholder={text.fromPlaceholder} className="form-input min-h-12 text-base" /></label>
                  <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1.5">{text.to}</span><input autoComplete="address-level2" value={to} onChange={e => setTo(e.target.value)} placeholder={text.toPlaceholder} className="form-input min-h-12 text-base" /></label>
                  <label className="block"><span className="flex items-center justify-between text-sm font-semibold text-slate-700 mb-1.5"><span>{text.when}</span><span className="text-xs font-normal text-slate-500">{text.optional}</span></span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input min-h-12 text-base" /></label>
                </div>

                <button type="submit" className="mt-5 w-full min-h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white py-3.5 px-5 font-extrabold text-base shadow-lg shadow-blue-500/20 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 flex items-center justify-center gap-2">{mode === 'passenger' ? <Search className="w-5 h-5" /> : <Car className="w-5 h-5" />}{mode === 'passenger' ? text.findRide : text.publishRide}<ArrowRight className="w-5 h-5" /></button>
                <p className="text-center text-xs text-slate-500 mt-2.5">{text.hint}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-slate-100 bg-slate-50/70">
                <button type="button" onClick={() => pick('passenger', emptyFilters)} className="min-h-16 p-4 text-left hover:bg-white transition flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"><div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5" /></div><div><p className="text-sm font-bold text-slate-800">{text.findOffers}</p><p className="text-xs text-slate-500">{text.looking}</p></div></button>
                <button type="button" onClick={() => pick('driver', { ...emptyFilters, fromLocation: from, toLocation: to, date }, true)} className="min-h-16 p-4 text-left hover:bg-white transition flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"><div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0"><Car className="w-5 h-5" /></div><div><p className="text-sm font-bold text-slate-800">{text.createOffer}</p><p className="text-xs text-slate-500">{text.driving}</p></div></button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
