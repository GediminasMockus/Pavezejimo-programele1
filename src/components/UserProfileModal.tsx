import { useEffect, useState } from 'react';
import { X, User, Star, TrendingUp, Calendar, Car, Users } from 'lucide-react';
import { supabase, type UserProfile, type Rating, type Trip } from '@/lib/supabase';
import { RatingStars, StarPicker } from '@/components/RatingStars';
import { formatDateTime } from '@/lib/format';

export function UserProfileModal({
  userId,
  displayName,
  onClose,
  onRate,
  canRate,
  tripContext,
}: {
  userId: string;
  displayName: string;
  onClose: () => void;
  onRate?: (score: number, comment?: string) => void | Promise<void>;
  canRate?: boolean;
  tripContext?: Trip | null;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRateForm, setShowRateForm] = useState(false);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  useEffect(() => {
    // Reset state when switching to a different user
    setHasRated(false);
    setShowRateForm(false);
    setScore(5);
    setComment('');

    async function load() {
      const [pRes, rRes, tRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('ratings').select('*').eq('rated_id', userId).order('created_at', { ascending: false }).limit(10),
        supabase
          .from('trips')
          .select('*')
          .eq('created_by', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (pRes.data) setProfile(pRes.data);
      if (rRes.data) setRatings(rRes.data);
      if (tRes.data) setTrips(tRes.data);
      setLoading(false);
    }
    load();
  }, [userId]);

  async function submitRating() {
    if (!onRate) return;
    setSubmitting(true);
    try {
      await onRate(score, comment.trim() || undefined);
      setShowRateForm(false);
      setHasRated(true);
    } catch (error) {
      // Keep the modal open so the user can retry after a server-side rejection.
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }

  const avgRating = profile?.avg_rating ?? 0;
  const totalRatings = profile?.total_ratings ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Vartotojo profilis</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-slate-900 truncate">{displayName}</h3>
                  {totalRatings > 0 ? (
                    <div className="flex items-center gap-2 mt-1">
                      <RatingStars score={avgRating} size="sm" />
                      <span className="text-sm text-slate-500">
                        {avgRating.toFixed(1)} ({totalRatings} {totalRatings === 1 ? 'vertinimas' : 'vertinimai'})
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 mt-1">Dar nėra vertinimų</p>
                  )}
                </div>
              </div>

              {canRate && !hasRated && (
                <div className="mb-5 rounded-2xl bg-blue-50 border border-blue-200 p-4">
                  {!showRateForm ? (
                    <button
                      onClick={() => setShowRateForm(true)}
                      className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Star className="w-4 h-4" />
                      Įvertinti vartotoją
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-center">
                        <StarPicker value={score} onChange={setScore} />
                      </div>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Komentaras (nebūtinas)"
                        rows={2}
                        className="form-input resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowRateForm(false)}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={submitRating}
                          disabled={submitting}
                          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                        >
                          {submitting ? 'Siunčiama…' : 'Pateikti'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasRated && (
                <div className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center text-sm text-emerald-700 font-semibold">
                  Ačiū už vertinimą!
                </div>
              )}

              {trips.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    Skelbimai ({trips.length})
                  </h4>
                  <div className="flex flex-col gap-2">
                    {trips.map((t) => (
                      <div key={t.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="flex items-center gap-2">
                          {t.role === 'driver' ? (
                            <Car className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <Users className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span className="font-medium text-slate-700">
                            {t.from_location} → {t.to_location}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{formatDateTime(t.departure_time)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ratings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Vertinimai ({totalRatings})
                  </h4>
                  <div className="flex flex-col gap-2">
                    {ratings.map((r) => (
                      <div key={r.id} className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                          <RatingStars score={r.score} size="sm" />
                          <span className="text-xs text-slate-400">
                            {new Date(r.created_at).toLocaleDateString('lt-LT')}
                          </span>
                        </div>
                        {r.comment && (
                          <p className="mt-1.5 text-sm text-slate-600">{r.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

