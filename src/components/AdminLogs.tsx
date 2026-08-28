import { useEffect, useState } from 'react';
import { Shield, Loader2, Car, Users, CheckCircle2, Mail, Star, Calendar, Trash2, Crown, AlertTriangle, RefreshCw, X, TrendingUp, Clock, MapPin } from 'lucide-react';
import { supabase, type Trip, type RideRequest, type UserProfile, type Rating } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { RatingStars } from '@/components/RatingStars';

type AdminTab = 'completed' | 'users' | 'trips' | 'requests' | 'stats';

export function AdminLogs({ onClose }: { onClose: () => void }) {
  const [completedTrips, setCompletedTrips] = useState<Trip[]>([]);
  const [completedRequests, setCompletedRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('completed');

  useEffect(() => {
    async function load() {
      const [tRes, rRes, pRes, ratRes, allTRes, allRRes] = await Promise.all([
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
          .from('user_profiles')
          .select('*')
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
      ]);
      if (tRes.data) setCompletedTrips(tRes.data);
      if (rRes.data) setCompletedRequests(rRes.data);
      if (pRes.data) setProfiles(pRes.data);
      if (ratRes.data) setRatings(ratRes.data);
      if (allTRes.data) setAllTrips(allTRes.data);
      if (allRRes.data) setAllRequests(allRRes.data);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDeleteTrip(tripId: string) {
    if (!confirm('Ar tikrai norite ištrinti šį skelbimą?')) return;
    setActionLoading(tripId);
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    setActionLoading(null);
    if (error) {
      alert('Nepavyko ištrinti: ' + error.message);
    } else {
      setAllTrips(prev => prev.filter(t => t.id !== tripId));
      setCompletedTrips(prev => prev.filter(t => t.id !== tripId));
    }
  }

  async function handleDeleteRequest(requestId: string) {
    if (!confirm('Ar tikrai norite ištrinti šią užklausą?')) return;
    setActionLoading(requestId);
    const { error } = await supabase.from('ride_requests').delete().eq('id', requestId);
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
      .from('user_profiles')
      .update({ is_admin: !currentAdmin })
      .eq('id', userId);
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
    const { error } = await supabase.from('user_profiles').delete().eq('id', userId);
    setActionLoading(null);
    if (error) {
      alert('Nepavyko ištrinti: ' + error.message);
    } else {
      setProfiles(prev => prev.filter(p => p.id !== userId));
    }
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Administravimas</h2>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
          >
            Uždaryti
          </button>
        </div>

        <div className="px-5 sm:px-6 pt-4">
          <div className="inline-flex rounded-full bg-slate-100 p-1 gap-1 flex-wrap">
            <button
              onClick={() => setTab('stats')}
              className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                tab === 'stats' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Statistika
            </button>
            <button
              onClick={() => setTab('completed')}
              className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                tab === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Užbaigtos
            </button>
            <button
              onClick={() => setTab('users')}
              className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Vartotojai ({profiles.length})
            </button>
            <button
              onClick={() => setTab('trips')}
              className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                tab === 'trips' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Skelbimai ({allTrips.length})
            </button>
            <button
              onClick={() => setTab('requests')}
              className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                tab === 'requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Užklausos ({allRequests.length})
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : tab === 'stats' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Car className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Visi skelbimai</span>
                </div>
                <p className="text-3xl font-bold text-blue-900">{allTrips.length}</p>
                <p className="text-xs text-blue-600 mt-1">{allTrips.filter(t => t.role === 'driver').length} vairuotojų · {allTrips.filter(t => t.role === 'passenger').length} keleivių</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Vartotojai</span>
                </div>
                <p className="text-3xl font-bold text-emerald-900">{profiles.length}</p>
                <p className="text-xs text-emerald-600 mt-1">{profiles.filter(p => p.is_admin).length} administratorių</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Užklausos</span>
                </div>
                <p className="text-3xl font-bold text-amber-900">{allRequests.length}</p>
                <p className="text-xs text-amber-600 mt-1">{allRequests.filter(r => r.status === 'pending').length} laukia · {allRequests.filter(r => r.status === 'accepted').length} patvirtintų</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Užbaigtos kelionės</span>
                </div>
                <p className="text-3xl font-bold text-purple-900">{completedTrips.length}</p>
                <p className="text-xs text-purple-600 mt-1">Sėkmingai įvykdytos</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100 border border-rose-200 p-4 col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-rose-600" />
                  <span className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Vertinimai</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold text-rose-900">{ratings.length}</p>
                  {ratings.length > 0 && (
                    <p className="text-lg font-semibold text-rose-700">
                      {(ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)} <span className="text-sm font-normal text-rose-600">vidurkis</span>
                    </p>
                  )}
                </div>
                <p className="text-xs text-rose-600 mt-1">Visi pateikti vertinimai</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 p-4 col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-5 h-5 text-cyan-600" />
                  <span className="text-xs font-semibold text-cyan-700 uppercase tracking-wide">Populiariausi maršrutai</span>
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
                        <span className="text-cyan-800 truncate flex-1">{route}</span>
                        <span className="text-cyan-600 font-semibold ml-2">{count} skelbimų</span>
                      </div>
                    )) : <p className="text-xs text-cyan-600">Dar nėra maršrutų</p>;
                  })()}
                </div>
              </div>
            </div>
          ) : tab === 'completed' ? (
            completedTrips.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">
                Kol kas nėra užbaigtų kelionių.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {completedTrips.map((t) => {
                  const req = completedRequests.find((r) => r.trip_id === t.id);
                  const profile = t.created_by ? profileMap.get(t.created_by) : null;
                  return (
                    <div key={t.id} className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          t.role === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {t.role === 'driver' ? <Car className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                          {t.role === 'driver' ? 'Vairuotojas' : 'Keleivis'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Užbaigta
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {t.from_location} → {t.to_location}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Išvykimas: {formatDateTime(t.departure_time)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Užbaigta: {t.completed_at ? formatDateTime(t.completed_at) : '—'}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span>Sukūrė: <span className="font-medium text-slate-600">{t.name}</span></span>
                        {profile?.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {profile.email}
                          </span>
                        )}
                      </div>
                      {req && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <p className="text-xs text-slate-500">
                            Keleivis: <span className="font-medium">{req.passenger_name}</span>
                          </p>
                          <p className="text-xs text-slate-500">
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
            <div className="flex flex-col gap-3">
              {profiles.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">
                  Kol kas nėra registruotų vartotojų.
                </p>
              ) : (
                profiles.map((p) => {
                  const userTrips = allTrips.filter((t) => t.created_by === p.id);
                  const userRatings = ratings.filter((r) => r.rated_id === p.id);
                  return (
                    <div key={p.id} className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-800 text-sm truncate">{p.display_name}</p>
                            {p.is_admin && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                                <Crown className="w-3 h-3" />
                                Admin
                              </span>
                            )}
                          </div>
                          {p.email && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {p.email}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleToggleAdmin(p.id, p.is_admin)}
                            disabled={actionLoading === p.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                            title={p.is_admin ? 'Atimti admin teises' : 'Suteikti admin teises'}
                          >
                            {actionLoading === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(p.id)}
                            disabled={actionLoading === p.id || p.is_admin}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                            title="Ištrinti vartotoją"
                          >
                            {actionLoading === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
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
            <div className="flex flex-col gap-3">
              {allTrips.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">
                  Kol kas nėra skelbimų.
                </p>
              ) : (
                allTrips.map((t) => (
                  <div key={t.id} className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.role === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {t.role === 'driver' ? <Car className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                            {t.role === 'driver' ? 'Vairuotojas' : 'Keleivis'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {t.status === 'active' ? 'Aktyvus' : 'Užbaigtas'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800 text-sm truncate">
                          {t.from_location} → {t.to_location}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDateTime(t.departure_time)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Sukūrė: {t.name}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteTrip(t.id)}
                        disabled={actionLoading === t.id}
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
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
            <div className="flex flex-col gap-3">
              {allRequests.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">
                  Kol kas nėra užklausų.
                </p>
              ) : (
                allRequests.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                            r.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 
                            r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.status === 'pending' ? 'Laukia' : 
                             r.status === 'accepted' ? 'Patvirtinta' : 
                             r.status === 'rejected' ? 'Atmesta' : 'Atšaukta'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.request_type === 'driver_offer' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {r.request_type === 'driver_offer' ? 'Pasiūlymas' : 'Užklausa'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800 text-sm truncate">
                          {r.pickup_location} → {r.dropoff_location}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Keleivis: {r.passenger_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(r.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteRequest(r.id)}
                        disabled={actionLoading === r.id}
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
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
