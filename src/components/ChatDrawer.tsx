import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Loader2, Check, CheckCheck, Star } from 'lucide-react';
import {
  supabase,
  type Trip,
  type Message,
  type NewMessage,
  type RideRequest,
} from '@/lib/supabase';
import { formatDateTime, formatTime, formatPrice } from '@/lib/format';
import { StarPicker } from '@/components/RatingStars';

export function ChatDrawer({
  trip,
  request,
  userId,
  onClose,
  onBothConfirmed,
}: {
  trip: Trip;
  request?: RideRequest | null;
  userId: string;
  onClose: () => void;
  onBothConfirmed?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myConfirmed, setMyConfirmed] = useState(false);
  const [otherConfirmed, setOtherConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateScore, setRateScore] = useState(5);
  const [rateComment, setRateComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clientId = userId;

  const isPassengerSide = request?.passenger_id === clientId;
  const isDriverSide = request?.request_type === 'driver_offer' ? request.driver_id === clientId : trip.created_by === clientId;
  const canConfirm = !!request && (isPassengerSide || isDriverSide);
  const bothConfirmed = myConfirmed && otherConfirmed;

  async function loadMessages() {
    setLoading(true);
    if (!request) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('trip_id', trip.id)
      .eq('request_id', request.id)
      .order('created_at', { ascending: true });
    if (error) {
      setError('Nepavyko įkelti žinučių.');
    } else {
      setMessages(data ?? []);
    }
    setLoading(false);
  }

  async function loadConfirmation() {
    if (!request) return;
    if (isPassengerSide) {
      setMyConfirmed(request.passenger_confirmed);
      setOtherConfirmed(request.driver_confirmed);
    } else if (isDriverSide) {
      setMyConfirmed(request.driver_confirmed);
      setOtherConfirmed(request.passenger_confirmed);
    }
  }

  useEffect(() => {
    loadMessages();
    loadConfirmation();
    supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setAuthorName(data?.display_name ?? (isPassengerSide ? request?.passenger_name : trip.name) ?? ''));
  }, [trip.id, request?.id, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (bothConfirmed && onBothConfirmed) {
      onBothConfirmed();
    }
  }, [bothConfirmed, onBothConfirmed]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!request || !body.trim()) return;

    setSending(true);
    const payload: NewMessage = {
      trip_id: trip.id,
      request_id: request.id,
      author_id: userId,
      author_name: authorName.trim(),
      body: body.trim(),
    };
    const { data, error } = await supabase
      .from('messages')
      .insert(payload)
      .select('*')
      .single();
    setSending(false);
    if (error || !data) {
      setError('Nepavyko išsiųsti žinutės.');
      return;
    }
    setMessages((prev) => [...prev, data]);
    setBody('');
  }

  async function handleConfirm() {
    if (!request) return;
    setConfirming(true);
    const { data, error } = await supabase.rpc('confirm_ride', { p_request_id: request.id });
    setConfirming(false);
    if (error || !data) {
      setError(error?.message === 'ride is not accepted' ? 'Ši kelionė dar nepatvirtinta vairuotojo.' : 'Nepavyko patvirtinti kelionės.');
      return;
    }

    setMyConfirmed(isPassengerSide ? data.passenger_confirmed : data.driver_confirmed);
    setOtherConfirmed(isPassengerSide ? data.driver_confirmed : data.passenger_confirmed);
  }

  async function submitRating() {
    if (!request) return;
    setRateSubmitting(true);
    const ratedId = isPassengerSide ? (request.request_type === 'driver_offer' ? request.driver_id : trip.created_by) : request.passenger_id;
    const role = isPassengerSide ? 'driver' : 'passenger';
    const ratingTripId = isPassengerSide && request.request_type === 'driver_offer' && request.driver_trip_id ? request.driver_trip_id : trip.id;
    const { error } = await supabase.rpc('submit_rating', {
      p_trip_id: ratingTripId,
      p_rated_id: ratedId,
      p_role: role,
      p_score: rateScore,
      p_comment: rateComment.trim() || null,
    });
    setRateSubmitting(false);
    if (error) {
      setError(error.message.includes('already submitted') ? 'Šią kelionę jau įvertinote.' : 'Nepavyko pateikti vertinimo.');
      return;
    }
    setRatingSubmitted(true);
    setShowRateForm(false);
  }

  const priceStr = formatPrice(trip);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl h-[85vh] sm:h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">
              {trip.from_location} → {trip.to_location}
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {formatDateTime(trip.departure_time)}
              {priceStr && ` · ${priceStr}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {canConfirm && (
          <div className="flex-shrink-0 px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-100">
            {bothConfirmed ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center gap-2 text-emerald-700 text-sm font-semibold">
                  <CheckCheck className="w-5 h-5" />
                  Abi pusės patvirtino — kelionė baigta!
                </div>
                {!ratingSubmitted && (
                  <button
                    onClick={() => setShowRateForm(!showRateForm)}
                    className="text-sm text-blue-600 hover:underline flex items-center justify-center gap-1"
                  >
                    <Star className="w-4 h-4" />
                    Įvertinti {isPassengerSide ? 'vairuotoją' : 'keleivį'}
                  </button>
                )}
                {showRateForm && (
                  <div className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-center">
                      <StarPicker value={rateScore} onChange={setRateScore} />
                    </div>
                    <textarea
                      value={rateComment}
                      onChange={(e) => setRateComment(e.target.value)}
                      placeholder="Komentaras (nebūtinas)"
                      rows={2}
                      className="form-input resize-none"
                    />
                    <button
                      onClick={submitRating}
                      disabled={rateSubmitting}
                      className="py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                    >
                      {rateSubmitting ? 'Siunčiama…' : 'Pateikti vertinimą'}
                    </button>
                  </div>
                )}
                {ratingSubmitted && (
                  <p className="text-center text-sm text-emerald-600 font-medium">
                    Ačiū už vertinimą!
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    myConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <Check className="w-3.5 h-3.5" />
                    Jūs {myConfirmed ? 'patvirtinote' : 'nepatvirtinote'}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    otherConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <Check className="w-3.5 h-3.5" />
                    Kita pusė {otherConfirmed ? 'patvirtino' : 'laukia'}
                  </span>
                </div>
                {!myConfirmed && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60"
                  >
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Patvirtinti
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                Kol kas nėra žinučių. Parašykite pirmas — derėkite dėl kainos!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.author_id === userId;
              return (
                <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      isOwn
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-slate-100 text-slate-800 rounded-bl-md'
                    }`}
                  >
                    <p className="text-xs font-semibold mb-0.5 opacity-70">{msg.author_name}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{error}</p>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="flex-shrink-0 border-t border-slate-100 p-3 sm:p-4 space-y-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Rašykite žinutę…"
              className="form-input flex-1"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !request || !body.trim() || !authorName.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Siųsti"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
