import { useEffect, useState } from 'react';
import { Car, Users, Route, Bell, Shield, LogOut, Settings as SettingsIcon, ArrowRight, Search, AlertCircle, List } from 'lucide-react';
import { supabase, type Notification, type TripRole } from '@/lib/supabase';
import { notificationCutoff } from '@/lib/notificationRetention';
import { emptyFilters, type FilterState } from '@/lib/tripFilters';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useLanguage } from '@/lib/useLanguage';
import { AdminLogs } from './AdminLogs';
import { SettingsModal } from './SettingsModal';
import { NotificationDrawer } from './NotificationDrawer';
import { AddressInput, type AddressValue } from './AddressInput';

export function HomeScreen({ userId, onPick, onSignOut, onOpenMatchedTrip, onOpenChat, onOpenRequest }: { userId: string; onPick: (role: TripRole, filters?: FilterState, create?: boolean) => void; onSignOut: () => void; onOpenMatchedTrip?: (tripId: string, matchedTripRole: TripRole) => void; onOpenChat?: (requestId: string) => void; onOpenRequest?: (requestId: string, role?: TripRole) => void }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const unreadCount = useUnreadCount(userId);
  const [recentEvents, setRecentEvents] = useState<Notification[]>([]);
  const [mode, setMode] = useState<TripRole>('passenger');
  const [from, setFrom] = useState<AddressValue>({ display_name: '', lat: null, lng: null });
  const [to, setTo] = useState<AddressValue>({ display_name: '', lat: null, lng: null });
  const [date, setDate] = useState('');
  const [searchError, setSearchError] = useState('');
  const { isEnglish } = useLanguage();

  const text = isEnglish ? {
    notifications: 'Notifications', activity: 'Needs your attention', allEvents: 'All notifications', settings: 'Settings', admin: 'Administration', signOut: 'Sign out', badge: 'Intercity rides', title1: 'Find someone', title2: 'going your way.', intro: 'Enter your route and time. We will show the most relevant rides or passengers.', need: 'Choose what you want to do', start: 'Plan your ride', looking: 'I need a ride', driving: 'I drive', from: 'From', to: 'To', when: 'When', findRide: 'Find rides', continueRide: 'Continue creating ride', hint: 'You can change filters later.', browseRides: 'Browse all rides', browseRequests: 'Browse passenger requests', browseRidesHint: 'Want to browse without a route filter?', browseRequestsHint: 'Want to see passengers without a route filter?', fromPlaceholder: 'City or pickup area', toPlaceholder: 'City or destination', optional: 'Optional', routeRequired: 'Enter both the departure and destination before searching.',
  } : {
    notifications: 'Pranešimai', activity: 'Reikia jūsų dėmesio', allEvents: 'Visi pranešimai', settings: 'Nustatymai', admin: 'Administracija', signOut: 'Atsijungti', badge: 'Pavežėjimai tarp miestų', title1: 'Rask žmogų,', title2: 'važiuojantį tavo kryptimi.', intro: 'Įvesk maršrutą ir laiką. Parodysime tinkamiausias keliones arba keleivius.', need: 'Pasirink, ką nori daryti', start: 'Suplanuok kelionę', looking: 'Ieškau kelionės', driving: 'Vežu keleivius', from: 'Iš kur', to: 'Į kur', when: 'Kada', findRide: 'Rasti keliones', continueRide: 'Tęsti kelionės kūrimą', hint: 'Filtrus galėsi pakeisti ir vėliau.', browseRides: 'Peržiūrėti visas keliones', browseRequests: 'Peržiūrėti keleivių užklausas', browseRidesHint: 'Nori peržiūrėti be maršruto filtro?', browseRequestsHint: 'Nori peržiūrėti keleivius be maršruto filtro?', fromPlaceholder: 'Miestas arba paėmimo vieta', toPlaceholder: 'Miestas arba kelionės tikslas', optional: 'Nebūtina', routeRequired: 'Prieš paiešką nurodyk ir išvykimo, ir atvykimo vietą.',
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc('get_my_profile_flags'),
      supabase.from('user_profiles').select('default_role').eq('id', userId).maybeSingle(),
    ]).then(([flagsResult, profileResult]) => {
      if (cancelled) return;
      setIsAdmin(flagsResult.data?.[0]?.is_admin === true);
      const preferredRole = profileResult.data?.default_role;
      if (preferredRole === 'driver' || preferredRole === 'passenger') setMode(preferredRole);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase.from('notifications').select('*')
        .eq('user_id', userId).eq('read', false).gte('created_at', notificationCutoff())
        .order('created_at', { ascending: false }).limit(3);
      if (!cancelled && data) setRecentEvents(data as Notification[]);
    };
    void refresh();
    const channel = supabase.channel(`home-activity-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => { void refresh(); })
      .subscribe();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [userId]);

  const openEvent = (event: Notification) => {
    if (!event.read) {
      setRecentEvents((items) => items.filter((item) => item.id !== event.id));
      void supabase.rpc('mark_notification_read', { p_notification_id: event.id });
    }
    if (event.type === 'new_message' && event.related_request_id && onOpenChat) onOpenChat(event.related_request_id);
    else if (event.type === 'new_offer' && event.related_request_id && onOpenRequest) onOpenRequest(event.related_request_id, 'passenger');
    else if (event.type === 'new_request' && event.related_request_id && onOpenRequest) onOpenRequest(event.related_request_id, 'driver');
    else if (event.type === 'auto_match_driver' && event.related_trip_id && onOpenMatchedTrip) onOpenMatchedTrip(event.related_trip_id, 'driver');
    else if (event.type === 'auto_match_passenger' && event.related_trip_id && onOpenMatchedTrip) onOpenMatchedTrip(event.related_trip_id, 'passenger');
    else if (event.related_request_id && onOpenRequest) onOpenRequest(event.related_request_id);
    else setShowNotifications(true);
  };

  const pick = (role: TripRole, filters?: FilterState, create = false) => {
    try { localStorage.setItem('pavezejimai_filters', JSON.stringify(filters ?? emptyFilters)); } catch { /* continue */ }
    onPick(role, filters, create);
  };

  const openResults = (resultRole: TripRole, filters: FilterState) => {
    try { localStorage.setItem('viewMode', 'list'); } catch { /* continue */ }
    pick(resultRole, filters);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedFrom = from.display_name.trim();
    const normalizedTo = to.display_name.trim();

    if (!normalizedFrom || !normalizedTo) {
      setSearchError(text.routeRequired);
      return;
    }

    setSearchError('');
    const filters = { ...emptyFilters, fromLocation: normalizedFrom, toLocation: normalizedTo, date };
    if (mode === 'passenger') openResults('passenger', filters);
    else pick('driver', filters, true);
  };

  return (
    <div className="min-h-screen relative">
      <div className="home-toolbar">
        <button onClick={() => setShowNotifications(true)} className="ui-button touch-target relative rounded-xl bg-surface/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={text.notifications}><Bell className="w-5 h-5" />{unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary-600 text-on-primary text-[10px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
        <button onClick={() => setShowSettings(true)} className="ui-button touch-target rounded-xl bg-surface/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={text.settings}><SettingsIcon className="w-5 h-5" /></button>
        {isAdmin && <button onClick={() => setShowAdmin(true)} className="ui-button touch-target rounded-xl bg-surface/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={text.admin}><Shield className="w-5 h-5" /></button>}
        <button onClick={onSignOut} className="ui-button touch-target rounded-xl bg-surface/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label={text.signOut}><LogOut className="w-5 h-5" /></button>
      </div>
      {showSettings && <SettingsModal userId={userId} onClose={() => setShowSettings(false)} onSignOut={onSignOut} />}
      {showAdmin && <AdminLogs onClose={() => setShowAdmin(false)} />}
      {showNotifications && (
        <NotificationDrawer
          userId={userId}
          onClose={() => setShowNotifications(false)}
          onOpenMatch={(tripId, matchedTripRole) => {
            setShowNotifications(false);
            onOpenMatchedTrip?.(tripId, matchedTripRole);
          }}
          onOpenRole={(role) => {
            setShowNotifications(false);
            onPick(role, emptyFilters, false);
          }}
          onOpenChat={(requestId) => {
            setShowNotifications(false);
            onOpenChat?.(requestId);
          }}
          onOpenRequest={(requestId, role) => {
            setShowNotifications(false);
            onOpenRequest?.(requestId, role);
          }}
        />
      )}

      <main className="home-layout">
        <div className="grid items-center gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <section className="home-hero">
            <div className="mb-4 inline-flex items-center gap-2 text-primary-700"><span className="w-2 h-2 rounded-full bg-primary-500" /><span className="text-xs font-semibold tracking-wide text-primary-700">{text.badge}</span></div>
            <div className="hidden lg:flex mb-6"><div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary-600 shadow-card flex items-center justify-center"><Route className="w-6 h-6 sm:w-7 sm:h-7 text-on-primary" strokeWidth={2.2} /></div></div>
            <h1 className="text-neutral-900">{text.title1}<span className="block text-primary-700 ">{text.title2}</span></h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-600 sm:text-base">{text.intro}</p>
          </section>

          <section className="w-full max-w-xl mx-auto lg:mr-0" aria-label={text.start}>
            <form onSubmit={submit} className="home-search" data-mode={mode}>
              <div className="p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{text.need}</p>
                <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">{text.start}</h2>

                <div className="home-mode mt-5" role="group" aria-label={text.need}>
                  <button type="button" aria-pressed={mode === 'passenger'} onClick={() => { setMode('passenger'); setSearchError(''); }} className={`ui-button min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${mode === 'passenger' ? 'bg-primary-600 border-primary-600 text-on-primary shadow-md' : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}><Users className="w-4 h-4 inline mr-1.5" />{text.looking}</button>
                  <button type="button" aria-pressed={mode === 'driver'} onClick={() => { setMode('driver'); setSearchError(''); }} className={`ui-button min-h-12 px-3 py-3 rounded-xl text-sm font-bold transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${mode === 'driver' ? 'bg-primary-600 border-primary-600 text-on-primary shadow-md' : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}><Car className="w-4 h-4 inline mr-1.5" />{text.driving}</button>
                </div>

                <div className="space-y-4 mt-6">
                  <div><label className="block text-sm font-semibold text-neutral-700 mb-1.5" htmlFor="ride-from-location">{text.from}</label><AddressInput id="ride-from-location" value={from} onChange={value => { setFrom(value); if (searchError) setSearchError(''); }} placeholder={text.fromPlaceholder} /></div>
                  <div><label className="block text-sm font-semibold text-neutral-700 mb-1.5" htmlFor="ride-to-location">{text.to}</label><AddressInput id="ride-to-location" value={to} onChange={value => { setTo(value); if (searchError) setSearchError(''); }} placeholder={text.toPlaceholder} /></div>
                  <label className="block"><span className="flex items-center justify-between text-sm font-semibold text-neutral-700 mb-1.5"><span>{text.when}</span><span className="text-xs font-normal text-neutral-500">{text.optional}</span></span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input min-h-12 text-base" /></label>
                </div>

                {searchError && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{searchError}</span></div>}

                <button type="submit" className="ui-button mt-5 w-full min-h-14 rounded-xl bg-primary-600 hover:bg-primary-700 text-on-primary py-3.5 px-5 font-bold text-base shadow-card transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30 flex items-center justify-center gap-2">{mode === 'passenger' ? <Search className="w-5 h-5" /> : <Car className="w-5 h-5" />}{mode === 'passenger' ? text.findRide : text.continueRide}<ArrowRight className="w-5 h-5" /></button>
                <p className="text-center text-xs text-neutral-500 mt-2.5">{text.hint}</p>

                <div className="mt-6 border-t border-neutral-100 pt-5 flex flex-col gap-3">
                  <span className="text-sm text-neutral-500">{mode === 'passenger' ? text.browseRidesHint : text.browseRequestsHint}</span>
                  <button
                    type="button"
                    onClick={() => openResults(mode, emptyFilters)}
                    className="ui-button min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-neutral-700 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <List className="w-4 h-4" />
                    {mode === 'passenger' ? text.browseRides : text.browseRequests}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
        {recentEvents.length > 0 && (
          <section className="mt-6 rounded-2xl border border-primary-200 bg-surface p-4 shadow-card" aria-label={text.activity}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-900">{text.activity}</h2>
              <button type="button" onClick={() => setShowNotifications(true)} className="ui-button px-2 text-sm font-semibold text-primary-700 hover:underline">{text.allEvents}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {recentEvents.map((event) => (
                <button key={event.id} type="button" onClick={() => openEvent(event)} className="ui-button flex min-h-16 items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-left text-sm font-medium text-neutral-900 hover:bg-primary-100">
                  <span className="min-w-0 break-words">{event.title}</span><ArrowRight className="h-4 w-4 shrink-0 text-primary-700" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
