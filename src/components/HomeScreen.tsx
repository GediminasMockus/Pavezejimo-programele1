import { useEffect, useState } from 'react';
import { Car, Users, Route, Bell, Shield, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { supabase, type TripRole } from '@/lib/supabase';
import { emptyFilters, type FilterState } from '@/lib/tripFilters';
import { useUnreadCount } from '@/lib/useUnreadCount';
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

  useEffect(() => {
    supabase.rpc('get_my_profile_flags')
      .then(({ data }) => setIsAdmin(data?.[0]?.is_admin === true));
  }, [userId]);



  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        <button onClick={() => setShowNotifications(true)} className="relative w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label="Pranešimai"><Bell className="w-4 h-4" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
        <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label="Parametrai"><SettingsIcon className="w-4 h-4" /></button>
        {isAdmin && <button onClick={() => setShowAdmin(true)} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label="Administracija"><Shield className="w-4 h-4" /></button>}
        <button onClick={onSignOut} className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white transition" aria-label="Atsijungti"><LogOut className="w-4 h-4" /></button>
      </div>
      {showSettings && <SettingsModal userId={userId} onClose={() => setShowSettings(false)} onSignOut={onSignOut} />}
      {showAdmin && <AdminLogs onClose={() => setShowAdmin(false)} />}
      {showNotifications && <NotificationDrawer userId={userId} onClose={() => setShowNotifications(false)} />}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-12">
        <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-12 items-center min-h-[calc(100vh-8rem)]">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-slate-200 px-3 py-1.5 shadow-sm mb-5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pavežėjimai tarp miestų</span></div>
            <div className="flex justify-center lg:justify-start mb-5"><div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center"><Route className="w-7 h-7 text-white" strokeWidth={2.2} /></div></div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.05]">Rask žmogų,<span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">važiuojantį tavo kryptimi.</span></h1>
            <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">Ne katalogas. Įvesk maršrutą, pasirink laiką ir rask tinkamiausią pavežėjimą arba keleivį.</p>
            <div className="mt-7 flex flex-wrap justify-center lg:justify-start gap-2 text-xs font-semibold text-slate-500"><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ Tikri profiliai</span><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ Įvertinimai</span><span className="px-3 py-2 rounded-full bg-white/70 border border-slate-200">✓ Susitarimas programėlėje</span></div>
          </div>

          <div className="w-full max-w-xl lg:ml-auto">
            <div className="bg-white/95 backdrop-blur rounded-[28px] border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3 mb-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ko tau reikia?</p><h2 className="text-xl font-extrabold text-slate-900 mt-1">Pradėk nuo maršruto</h2></div><div className="flex rounded-xl bg-slate-100 p-1"><button onClick={() => setMode('passenger')} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${mode === 'passenger' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Ieškau</button><button onClick={() => setMode('driver')} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${mode === 'driver' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Vežu</button></div></div>
                <div className="space-y-3">
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Iš</span><input value={from} onChange={e => setFrom(e.target.value)} placeholder="Vilnius" className="w-full bg-transparent outline-none text-base font-semibold text-slate-900 placeholder:text-slate-300" /></label>
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Į</span><input value={to} onChange={e => setTo(e.target.value)} placeholder="Kaunas" className="w-full bg-transparent outline-none text-base font-semibold text-slate-900 placeholder:text-slate-300" /></label>
                  <label className="block rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Kada</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent outline-none text-base font-semibold text-slate-900" /></label>
                </div>
                <button onClick={() => onPick(mode, { ...emptyFilters, fromLocation: from, toLocation: to, date }, mode === 'driver')} className="mt-4 w-full rounded-2xl bg-slate-900 hover:bg-blue-600 text-white py-4 px-5 font-extrabold text-base shadow-lg shadow-slate-900/15 hover:shadow-blue-500/20 transition-all active:scale-[0.99]">{mode === 'passenger' ? 'Rasti kelionę' : 'Paskelbti kelionę'}<span className="ml-2">→</span></button>
                <p className="text-center text-[11px] text-slate-400 mt-3">Maršrutas ir laikas padės parodyti tinkamiausius atitikmenis.</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100 bg-slate-50/70">
                <button onClick={() => onPick('driver', { ...emptyFilters, fromLocation: from, toLocation: to, date }, true)} className="p-4 text-left hover:bg-white transition group"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><Car className="w-4 h-4" /></div><div><p className="text-sm font-bold text-slate-800 group-hover:text-blue-600">Vežu</p><p className="text-[11px] text-slate-400">Sukurti pasiūlymą</p></div></div></button>
                <button onClick={() => onPick('passenger')} className="p-4 text-left hover:bg-white transition group"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Users className="w-4 h-4" /></div><div><p className="text-sm font-bold text-slate-800 group-hover:text-emerald-600">Ieškau</p><p className="text-[11px] text-slate-400">Rasti pasiūlymus</p></div></div></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3"><div className="rounded-2xl bg-white/70 border border-slate-200 p-3 text-center"><p className="text-lg font-black text-slate-900">1</p><p className="text-[10px] font-semibold text-slate-400">maršrutas</p></div><div className="rounded-2xl bg-white/70 border border-slate-200 p-3 text-center"><p className="text-lg font-black text-slate-900">2</p><p className="text-[10px] font-semibold text-slate-400">žingsniai iki susitarimo</p></div><div className="rounded-2xl bg-white/70 border border-slate-200 p-3 text-center"><p className="text-lg font-black text-slate-900">0</p><p className="text-[10px] font-semibold text-slate-400">nereikalingų ekranų</p></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

