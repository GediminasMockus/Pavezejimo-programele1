import { useDialogFocus } from '@/lib/useDialogFocus';
import { useEffect, useState } from 'react';
import { Shield, Loader2, Car, Users, CheckCircle2, Mail, Star, Calendar, Trash2, Crown, TrendingUp, MapPin } from 'lucide-react';
import { supabase, type Trip, type RideRequest, type UserProfile, type Rating } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';

type AdminTab = 'completed' | 'users' | 'trips' | 'requests' | 'stats' | 'feedback';
type FeedbackFilter = 'all' | FeedbackEntry['status'];
type FeedbackEntry = {
  id: string; user_id: string; category: 'problem' | 'suggestion' | 'rating';
  message: string; rating: number | null; screen: string; role: string | null;
  page_url: string; user_agent: string; app_version: string;
  status: 'new' | 'reviewed' | 'fixed'; created_at: string;
};

export function AdminLogs({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus();
  const [completedTrips, setCompletedTrips] = useState<Trip[]>([]);
  const [completedRequests, setCompletedRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loadError, setLoadError] = useState('');
  const [profilesError, setProfilesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('feedback');
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all');

  useEffect(() => {
    async function load() {
      const [tRes, rRes, pRes, ratRes, allTRes, allRRes, feedbackRes] = await Promise.all([
        supabase
          .from('trips')
          .select('*')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(100),
        supabase
          .from('ride_requests')
          .select('*')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(100),
        supabase
          .rpc('admin_list_profiles')
          .order('created_at', { ascending: false }),
        supabase
          .from('ratings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('trips')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('ride_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('app_feedback').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (pRes.error) {
        setProfilesError(true);
        setLoadError('Nepavyko įkelti vartotojų sąrašo. Pabandykite atidaryti administravimą iš naujo.');
      } else if ([tRes,rRes,ratRes,allTRes,allRRes,feedbackRes].some(result => result.error)) {
        setLoadError('Nepavyko įkelti dalies administravimo duomenų.');
      }
      if (tRes.data) setCompletedTrips(tRes.data);
      if (rRes.data) setCompletedRequests(rRes.data);
      if (pRes.data) setProfiles(pRes.data);
      if (ratRes.data) setRatings(ratRes.data);
      if (allTRes.data) setAllTrips(allTRes.data);
      if (allRRes.data) setAllRequests(allRRes.data);
      if (feedbackRes.data) setFeedback(feedbackRes.data as FeedbackEntry[]);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDeleteTrip(tripId: string) {
    if (!confirm('Ar tikrai norite ištrinti šį skelbimą?')) return;
    setActionLoading(tripId);
    const { error } = await supabase.rpc('admin_delete_record', { p_kind: 'trip', p_id: tripId });
    setActionLoading(null);
    if (error) {
      alert('Nepavyko ištrinti: ' + error.message);
    } else {
      setAllTrips(prev => prev.filter(t => t.id !== tripId));
      setCompletedTrips(prev => prev.filter(t => t.id !== tripId));
    }
  }

  async function updateFeedbackStatus(id: string, status: FeedbackEntry['status']) {
    setActionLoading(id);
    const { error } = await supabase.from('app_feedback').update({ status }).eq('id', id);
    setActionLoading(null);
    if (error) setLoadError('Nepavyko pakeisti atsiliepimo būsenos.');
    else setFeedback(current => current.map(entry => entry.id === id ? { ...entry, status } : entry));
  }

  async function handleDeleteRequest(requestId: string) {
    if (!confirm('Ar tikrai norite ištrinti šią užklausą?')) return;
    setActionLoading(requestId);
    const { error } = await supabase.rpc('admin_delete_record', { p_kind: 'request', p_id: requestId });
    setActionLoading(null);
    if (error) {
      alert('Nepavyko ištrinti: ' + error.message);
    } else {
      setAllRequests(prev => prev.filter(r => r.id !== requestId));
      setCompletedRequests(prev => prev.filter(r => r.id !== requestId));
    }
  }

  async function handleToggleAdmin(userId: string, currentAdmin: boolean) {
    if (currentAdmin && !confirm('Ar tikrai norite atimti administratoriaus teises?')) return;
    setActionLoading(userId);
    const { error } = await supabase
      .rpc('admin_set_role', { p_user_id: userId, p_is_admin: !currentAdmin });
    setActionLoading(null);
    if (error) {
      alert('Nepavyko atnaujinti: ' + error.message);
    } else {
      setProfiles(prev => prev.map(p =>
        p.id === userId ? { ...p, is_admin: !currentAdmin } : p
      ));
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Ar tikrai norite ištrinti šį vartotoją? Visi jo duomenys bus pašalinti.')) return;
    setActionLoading(userId);
    const { error } = await supabase.functions.invoke('admin-users', { body: { userId } });
    setActionLoading(null);
    if (error) {
      alert('Nepavyko ištrinti: ' + error.message);
    } else {
      setProfiles(prev => prev.filter(p => p.id !== userId));
    }
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const newFeedbackCount = feedback.filter(entry => entry.status === 'new').length;
  const visibleFeedback = feedbackFilter === 'all' ? feedback : feedback.filter(entry => entry.status === feedbackFilter);
  const tabs: { id: AdminTab; label: string; count?: number }[] = [
    { id: 'feedback', label: 'Atsiliepimai', count: newFeedbackCount },
    { id: 'stats', label: 'Statistika' },
    { id: 'users', label: 'Vartotojai', count: loading || profilesError ? undefined : profiles.length },
    { id: 'trips', label: 'Skelbimai', count: allTrips.length },
    { id: 'requests', label: 'Užklausos', count: allRequests.length },
    { id: 'completed', label: 'Užbaigtos', count: completedTrips.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 backdrop-blur-sm sm:p-4">
      <div className="modal-panel admin-panel bg-surface shadow-overlay" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="AdminLogs-title">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-neutral-200 bg-surface px-4 pb-4 pt-5 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary-100 text-primary-700"><Shield className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 id="AdminLogs-title" className="text-lg font-bold text-neutral-900 sm:text-xl">Administravimas</h2>
              <p className="hidden text-xs text-neutral-500 sm:block">Atsiliepimai ir programėlės duomenys vienoje vietoje</p>
            </div>
          </div>
          <button
            data-dialog-close onClick={onClose}
            className="ui-button flex-none rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"
          >
            Uždaryti
          </button>
        </div>

        <nav aria-label="Administravimo skyriai" className="admin-tabs flex flex-none gap-2 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:px-7">
          {tabs.map(item => <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`ui-button flex flex-none items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${tab === item.id ? 'border-primary-500 bg-primary-600 text-on-primary shadow-sm' : 'border-neutral-200 bg-surface text-neutral-600 hover:border-primary-300 hover:text-primary-700'}`}
          >{item.label}{item.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === item.id ? 'bg-surface/20 text-on-primary' : 'bg-neutral-100 text-neutral-600'}`}>{item.count}</span>}</button>)}
        </nav>

        <div className="admin-content min-h-0 flex-1 overflow-y-auto overscroll-contain bg-neutral-50/50 px-4 py-5 sm:px-7 sm:py-6">
          {loadError && <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{loadError}</p>}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">{tabs.find(item => item.id === tab)?.label}</h3>
              {tab === 'feedback' && <p className="mt-1 text-sm text-neutral-600">Vartotojų problemos, pasiūlymai ir programėlės vertinimai.</p>}
            </div>
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : tab === 'feedback' ? (
            <div>
              <div aria-label="Atsiliepimų filtras" className="mb-5 flex flex-wrap gap-2">
                {([['all', 'Visi'], ['new', 'Nauji'], ['reviewed', 'Peržiūrėti'], ['fixed', 'Ištaisyti']] as const).map(([value, label]) =>
                  <button key={value} type="button" aria-pressed={feedbackFilter === value} onClick={() => setFeedbackFilter(value)} className={`ui-button rounded-full border px-3.5 py-2 text-xs font-semibold ${feedbackFilter === value ? 'border-primary-400 bg-primary-100 text-primary-800' : 'border-neutral-200 bg-surface text-neutral-600 hover:border-primary-300'}`}>{label}{value === 'new' ? ` (${newFeedbackCount})` : ''}</button>
                )}
              </div>
              {visibleFeedback.length === 0 ? <p className="rounded-2xl border border-neutral-200 bg-surface px-5 py-10 text-center text-sm text-neutral-600">{feedback.length === 0 ? 'Atsiliepimų kol kas nėra.' : 'Šios būsenos atsiliepimų nėra.'}</p> : null}
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                {visibleFeedback.map(entry => <article key={entry.id} className="min-w-0 rounded-2xl border border-neutral-200 bg-surface p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-bold text-primary-800">{entry.category === 'problem' ? 'Problema' : entry.category === 'suggestion' ? 'Pasiūlymas' : 'Programėlės vertinimas'}</span>
                      {entry.rating && <span className="text-sm font-semibold text-primary-700">★ {entry.rating}/5</span>}
                    </div>
                    <time className="text-xs text-neutral-500" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                  </div>
                  {entry.message && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800">{entry.message}</p>}
                  <details className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-600"><summary className="cursor-pointer font-medium text-primary-700">Techninė informacija</summary>
                    <p className="mt-2 break-all">Vartotojas: {entry.user_id}</p>
                    <p>Ekranas: {entry.screen} · {entry.role ?? '–'} · {entry.app_version}</p>
                    <p className="break-all">{entry.page_url}</p><p className="break-all">{entry.user_agent}</p>
                  </details>
                  <label className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-sm font-semibold text-neutral-700">Būsena
                    <select aria-label="Atsiliepimo būsena" className="form-input !min-h-11 !w-auto !py-2" value={entry.status} disabled={actionLoading === entry.id} onChange={event => void updateFeedbackStatus(entry.id, event.target.value as FeedbackEntry['status'])}>
                      <option value="new">Naujas</option><option value="reviewed">Peržiūrėtas</option><option value="fixed">Ištaisytas</option>
                    </select>
                  </label>
                </article>)}
              </div>
            </div>
          ) : tab === 'stats' ? (
            <div className="admin-stats grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Car className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Visi skelbimai</span>
                </div>
                <p className="text-3xl font-bold text-neutral-900">{allTrips.length}</p>
                <p className="text-xs text-neutral-600 mt-1">{allTrips.filter(t => t.role === 'driver').length} vairuotojų · {allTrips.filter(t => t.role === 'passenger').length} keleivių</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Vartotojai</span>
                </div>
                <p className="text-3xl font-bold text-neutral-900">{profilesError ? '—' : profiles.length}</p>
                <p className="text-xs text-neutral-600 mt-1">{profilesError ? 'Nepavyko įkelti vartotojų' : `${profiles.filter(p => p.is_admin).length} administratorių`}</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Užklausos</span>
                </div>
                <p className="text-3xl font-bold text-neutral-900">{allRequests.length}</p>
                <p className="text-xs text-neutral-600 mt-1">{allRequests.filter(r => r.status === 'pending').length} laukia · {allRequests.filter(r => r.status === 'accepted').length} patvirtintų</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Užbaigtos kelionės</span>
                </div>
                <p className="text-3xl font-bold text-neutral-900">{completedTrips.length}</p>
                <p className="text-xs text-neutral-600 mt-1">Sėkmingai įvykdytos</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Vertinimai</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold text-neutral-900">{ratings.length}</p>
                  {ratings.length > 0 && (
                    <p className="text-lg font-semibold text-neutral-700">
                      {(ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)} <span className="text-sm font-normal text-neutral-600">vidurkis</span>
                    </p>
                  )}
                </div>
                <p className="text-xs text-neutral-600 mt-1">Visi pateikti vertinimai</p>
              </div>
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-5 h-5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Populiariausi maršrutai</span>
                </div>
                <div className="space-y-1">
                  {(() => {
                    const routeCounts = new Map<string, number>();
                    allTrips.forEach(t => {
                      const route = `${t.from_location} → ${t.to_location}`;
                      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
                    });
                    const sorted = Array.from(routeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
                    return sorted.length > 0 ? sorted.map(([route, count]) => (
                      <div key={route} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-800 truncate flex-1">{route}</span>
                        <span className="text-neutral-600 font-semibold ml-2">{count} skelbimų</span>
                      </div>
                    )) : <p className="text-xs text-neutral-600">Dar nėra maršrutų</p>;
                  })()}
                </div>
              </div>
            </div>
          ) : tab === 'completed' ? (
            completedTrips.length === 0 ? (
              <p className="text-center text-sm text-neutral-500 py-10">
                Kol kas nėra užbaigtų kelionių.
              </p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                {completedTrips.map((t) => {
                  const req = completedRequests.find((r) => r.trip_id === t.id);
                  const profile = t.created_by ? profileMap.get(t.created_by) : null;
                  return (
                    <div key={t.id} className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          t.role === 'driver' ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-100 text-neutral-700'
                        }`}>
                          {t.role === 'driver' ? <Car className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                          {t.role === 'driver' ? 'Vairuotojas' : 'Keleivis'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-success-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Užbaigta
                        </span>
                      </div>
                      <p className="font-semibold text-neutral-800 text-sm">
                        {t.from_location} → {t.to_location}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Išvykimas: {formatDateTime(t.departure_time)}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Užbaigta: {t.completed_at ? formatDateTime(t.completed_at) : '—'}
                      </p>
                      <div className="mt-2 pt-2 border-t border-neutral-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span>Sukūrė: <span className="font-medium text-neutral-600">{t.name}</span></span>
                        {profile?.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {profile.email}
                          </span>
                        )}
                      </div>
                      {req && (
                        <div className="mt-2 pt-2 border-t border-neutral-200">
                          <p className="text-xs text-neutral-500">
                            Keleivis: <span className="font-medium">{req.passenger_name}</span>
                          </p>
                          <p className="text-xs text-neutral-500">
                            Paėmimas: {req.pickup_location} → Išlaipinimas: {req.dropoff_location}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : tab === 'users' ? (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              {profilesError ? (
                <p role="alert" className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">Nepavyko įkelti vartotojų. Uždarykite ir atidarykite administravimo langą iš naujo.</p>
              ) : profiles.length === 0 ? (
                <p className="text-center text-sm text-neutral-500 py-10">
                  Kol kas nėra registruotų vartotojų.
                </p>
              ) : (
                profiles.map((p) => {
                  const userTrips = allTrips.filter((t) => t.created_by === p.id);
                  const userRatings = ratings.filter((r) => r.rated_id === p.id);
                  return (
                    <div key={p.id} className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-on-primary font-bold text-sm flex-shrink-0">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-neutral-800 text-sm truncate">{p.display_name}</p>
                            {p.is_admin && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-semibold">
                                <Crown className="w-3 h-3" />
                                Admin
                              </span>
                            )}
                          </div>
                          {p.email && (
                            <p className="text-xs text-neutral-500 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {p.email}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleToggleAdmin(p.id, p.is_admin ?? false)}
                            disabled={actionLoading === p.id}
                            className="ui-button w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors disabled:opacity-50"
                            title={p.is_admin ? 'Atimti admin teises' : 'Suteikti admin teises'}
                          >
                            {actionLoading === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(p.id)}
                            disabled={actionLoading === p.id || p.is_admin}
                            className="ui-button w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-danger-50 hover:text-danger-700 transition-colors disabled:opacity-50"
                            title="Ištrinti vartotoją"
                          >
                            {actionLoading === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(p.created_at)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          {userTrips.length} skelbimų
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          {userRatings.length} vertinimų
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : tab === 'trips' ? (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              {allTrips.length === 0 ? (
                <p className="text-center text-sm text-neutral-500 py-10">
                  Kol kas nėra skelbimų.
                </p>
              ) : (
                allTrips.map((t) => (
                  <div key={t.id} className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.role === 'driver' ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-100 text-neutral-700'
                          }`}>
                            {t.role === 'driver' ? <Car className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                            {t.role === 'driver' ? 'Vairuotojas' : 'Keleivis'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.status === 'active' ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {t.status === 'active' ? 'Aktyvus' : 'Užbaigtas'}
                          </span>
                        </div>
                        <p className="font-semibold text-neutral-800 text-sm truncate">
                          {t.from_location} → {t.to_location}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                          {formatDateTime(t.departure_time)}
                        </p>
                        <p className="text-xs text-neutral-500">
                          Sukūrė: {t.name}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteTrip(t.id)}
                        disabled={actionLoading === t.id}
                        className="ui-button flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-danger-50 hover:text-danger-700 transition-colors disabled:opacity-50"
                        title="Ištrinti skelbimą"
                      >
                        {actionLoading === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : tab === 'requests' ? (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              {allRequests.length === 0 ? (
                <p className="text-center text-sm text-neutral-500 py-10">
                  Kol kas nėra užklausų.
                </p>
              ) : (
                allRequests.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.status === 'pending' ? 'bg-warning-100 text-warning-700' :
                            r.status === 'accepted' ? 'bg-success-100 text-success-700' :
                            r.status === 'rejected' ? 'bg-danger-100 text-danger-700' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {r.status === 'pending' ? 'Laukia' :
                             r.status === 'accepted' ? 'Patvirtinta' :
                             r.status === 'rejected' ? 'Atmesta' : 'Atšaukta'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.request_type === 'driver_offer' ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-100 text-neutral-700'
                          }`}>
                            {r.request_type === 'driver_offer' ? 'Pasiūlymas' : 'Užklausa'}
                          </span>
                        </div>
                        <p className="font-semibold text-neutral-800 text-sm truncate">
                          {r.pickup_location} → {r.dropoff_location}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                          Keleivis: {r.passenger_name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatDateTime(r.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteRequest(r.id)}
                        disabled={actionLoading === r.id}
                        className="ui-button flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-danger-50 hover:text-danger-700 transition-colors disabled:opacity-50"
                        title="Ištrinti užklausą"
                      >
                        {actionLoading === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
