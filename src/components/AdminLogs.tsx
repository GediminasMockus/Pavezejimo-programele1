import { useEffect, useState } from 'react';
import { Shield, Loader2, Car, Users, CheckCircle2, Mail, Star, Calendar } from 'lucide-react';
import { supabase, type Trip, type RideRequest, type UserProfile, type Rating } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { RatingStars } from '@/components/RatingStars';

export function AdminLogs({ onClose }: { onClose: () => void }) {
  const [completedTrips, setCompletedTrips] = useState<Trip[]>([]);
  const [completedRequests, setCompletedRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'completed' | 'users'>('completed');

  useEffect(() => {
    async function load() {
      const [tRes, rRes, pRes, ratRes, allTRes] = await Promise.all([
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
      ]);
      if (tRes.data) setCompletedTrips(tRes.data);
      if (rRes.data) setCompletedRequests(rRes.data);
      if (pRes.data) setProfiles(pRes.data);
      if (ratRes.data) setRatings(ratRes.data);
      if (allTRes.data) setAllTrips(allTRes.data);
      setLoading(false);
    }
    load();
  }, []);

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
          <div className="inline-flex rounded-full bg-slate-100 p-1 gap-1">
            <button
              onClick={() => setTab('completed')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                tab === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Užbaigtos kelionės
            </button>
            <button
              onClick={() => setTab('users')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Vartotojai ({profiles.length})
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Įkeliama…</p>
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
          ) : (
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
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-sm truncate">{p.display_name}</p>
                          {p.email && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              {p.email}
                            </p>
                          )}
                        </div>
                        {p.total_ratings > 0 && (
                          <div className="flex-shrink-0 flex flex-col items-end">
                            <RatingStars score={Number(p.avg_rating)} size="sm" />
                            <span className="text-xs text-slate-400 mt-0.5">{p.total_ratings} vert.</span>
                          </div>
                        )}
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
          )}
        </div>
      </div>
    </div>
  );
}
