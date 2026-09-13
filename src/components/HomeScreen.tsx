import { useEffect, useState } from 'react';
import { Car, Users, Route, Bell, Shield, LogOut, Settings as SettingsIcon } from 'lucide-react';
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
    notifications: 'Notifications', settings: 'Settings', admin: 'Administration', signOut: 'Sign out', badge: 'Intercity rides', title1: 'Find someone', title2: 'going your way.', intro: 'Enter your route, choose a time and find the best ride or passenger match.', profiles: 'Verified profiles', ratings: 'Ratings', agreement: 'Agreement in the app', need: 'What do you need?', start: 'Start with a route', looking: 'I need a ride', driving: 'I drive', from: 'From', to: 'To', when: 'When', findRide: 'Find a ride', publishRide: 'Publish a ride', hint: 'Route and time help us show the most relevant matches.', createOffer: 'Create an offer', findOffers: 'Find offers',
  } : {
    notifications: 'Pranešimai', settings: 'Parametrai', admin: 'Administracija', signOut: 'Atsijungti', badge: 'Pavežėjimai tarp miestų', title1: 'Rask žmogų,', title2: 'važiuojantį tavo kryptimi.', intro: 'Ne katalogas. Įvesk maršrutą, pasirink laiką ir rask tinkamiausią pavežėjimą arba keleivį.', profiles: 'Tikri profiliai', ratings: 'Įvertinimai', agreement: 'Susitarimas programėlėje', need: 'Ko tau reikia?', start: 'Pradėk nuo maršruto', looking: 'Ieškau', driving: 'Vežu', from: 'Iš', to: 'Į', when: 'Kada', findRide: 'Rasti kelionę', publishRide: 'Paskelbti kelionę', hint: 'Maršrutas ir laikas padės parodyti tinkamiausius atitikmenis.', createOffer: 'Sukurti pasiūlymą', findOffers: 'Rasti pasiūlymus',
  };

  useEffect(() => {
    supabase.rpc('get_my_profile_flags')
      .then(({ data }) => setIsAdmin(data?.[0]?.is_admin === true));
  }, [userId]);

  const pick = (role: TripRole, filters?: FilterState, create = false) => {
    try {
      localStorage.removeItem('pavezejimai_filters');
    } catch {
      // Ignore localStorage errors and continue with the current search.
    }
    onPick(role, filters, create);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        <button onClick={() => setShowNotifications(true)} className="relative w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label={text.notifications}><Bell className="w-4 h-4" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
        <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label={text.settings}><SettingsIcon className="w-4 h-4" /></button>
        {isAdmin && <button onClick={() => setShowAdmin(true)} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label={text.admin}><Shield className="w-4 h-4" /></button>}
        <button onClick={onSignOut} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label={text.signOut}><LogOut className="w-4 h-4" /></button>
      </div>
      {showSettings && <SettingsModal userId={userId} onClose={() => setShowSettings(false)} onSignOut={onSignOut} />}
      {showAdmin && <AdminLogs onClose={() => setShowAdmin(false)} />}
      {showNotifications && <NotificationDrawer userId={userId} onClose={() => setShowNotifications(false)} />}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-12">
        <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-12 items-center min-h-[calc(100vh-8rem)]">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-slate-200 px-3 py-1.5 shadow-sm mb-5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{text.badge}</span></div>
            <div className="flex justify-center lg:justify-start mb-5"><div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center"><Route className="w-7 h-7 text-white" strokeWidth={2.2} /></div></div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.05]">{text.title1}<span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{text.title2}</span></h1>
            <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">{text.intro}</p>
            <div className="mt-7 flex flex-wrap justify-center lg:justify-start gap-2 text-xs font-semibold text-slate-500"><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ {text.profiles}</span><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ {text.ratings}</span><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ {text.agreement}</span></div>
          </div>

          <div className="w-full max-w-xl lg:ml-auto">
            <div className="bg-white/95 backdrop-blur rounded-[28px] border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3 mb-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{text.need}</p><h2 className="text-xl font-extrabold text-slate-900 mt-1">{text.start}</h2></div><div className="flex rounded-xl bg-slate-100 p-1"><button onClick={() => setMode('passenger')} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${mode === 'passenger' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.looking}</button><button onClick={() => setMode('driver')} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${mode === 'driver' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.driving}</button></div></div>
                <div className="space-y-3">
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{text.from}</span><input value={from} onChange={e => setFrom(e.target.value)} placeholder="Vilnius" className="w-full bg-transparent outline-none text-base font-semibold text-slate-900 placeholder:text-slate-300" /></label>
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{text.to}</span><input value={to} onChange={e => setTo(e.target.value)} placeholder="Kaunas" className="w-full bg-transparent outline-none text-base font-semibold text-slate-900 placeholder:text-slate-300" /></label>
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{text.when}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent outline-none text-base font-semibold text-slate-900" /></label>
                </div>
                <button onClick={() => pick(mode, { ...emptyFilters, fromLocation: from, toLocation: to, date }, mode === 'driver')} className="mt-4 w-full rounded-2xl bg-slate-900 hover:bg-blue-600 text-white py-4 px-5 font-extrabold text-base shadow-lg shadow-slate-900/15 hover:shadow-blue-500/20 transition-all active:scale-[0.99]">{mode === 'passenger' ? text.findRide : text.publishRide}<span className="ml-2">→</span></button>
                <p className="text-center text-[11px] text-slate-400 mt-3">{text.hint}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100 bg-slate-50/70">
                <button onClick={() => pick('driver', { ...emptyFilters, fromLocation: from, toLocation: to, date }, true)} className="p-4 text-left hover:bg-white transition group"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><Car className="w-4 h-4" /></div><div><p className="text-sm font-bold text-slate-800 group-hover:text-blue-600">{text.driving}</p><p className="text-[11px] text-slate-400">{text.createOffer}</p></div></div></button>
                <button onClick={() => pick('passenger', emptyFilters)} className="p-4 text-left hover:bg-white transition group"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Users className="w-4 h-4" /></div><div><p className="text-sm font-bold text-slate-800 group-hover:text-emerald-600">{text.looking}</p><p className="text-[11px] text-slate-400">{text.findOffers}</p></div></div></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
