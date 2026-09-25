import { useDialogFocus } from '@/lib/useDialogFocus';
import { navigationUrl } from '@/lib/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X, Loader2, Check, CheckCheck, Star, Navigation } from 'lucide-react';
import {
  supabase,
  type Trip,
  type Message,
  type NewMessage,
  type RideRequest,
} from '@/lib/supabase';
import type { Match } from '@/lib/matchTypes';
import { formatDateTime, formatTime, formatPrice } from '@/lib/format';
import { StarPicker } from '@/components/RatingStars';

export function ChatDrawer({
  trip,
  request,
  match,
  userId,
  onClose,
  onBothConfirmed,
}: {
  trip: Trip;
  request?: RideRequest | null;
  match?: Match | null;
  userId: string;
  onClose: () => void;
  onBothConfirmed?: () => void;
}) {
  const dialogRef = useDialogFocus();
  const [messageLimit, setMessageLimit] = useState(50);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const completionNotified = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMatch, setActiveMatch] = useState<Match | null>(match ?? null);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [requestStatus, setRequestStatus] = useState(request?.status ?? null);
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
  const matchId = activeMatch?.id ?? null;
  const canSendMessages = requestStatus === 'accepted';

  const resolveMatch = useCallback(async () => {
    if (match) {
      setActiveMatch(match);
      return match;
    }
    if (!request) {
      setActiveMatch(null);
      return null;
    }

    const { data, error: matchError } = await supabase.rpc('get_my_matches');
    if (matchError) {
      setError('Nepavyko nustatyti kelionės atitikmens.');
      setActiveMatch(null);
      return null;
    }

    const resolved = ((data ?? []) as Match[]).find((item) => item.request_id === request.id) ?? null;
    setActiveMatch(resolved);
    return resolved;
  }, [match, request]);

  const loadMessages = useCallback(async (resolvedMatch?: Match | null) => {
    setLoading(true);
    if (!request) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const currentMatch = resolvedMatch;
    const query = supabase.from('messages').select('*');
    const { data, error: messageError } = currentMatch
      ? await query
          .eq('match_id', currentMatch.id)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(messageLimit + 1)
      : await query
          .eq('request_id', request.id)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(messageLimit + 1);

    if (messageError) {
      setError('Nepavyko įkelti žinučių.');
    } else {
      setHasOlderMessages((data?.length ?? 0) > messageLimit);
      setMessages((data ?? []).slice(0, messageLimit).reverse());
    }
    setLoading(false);
  }, [request, messageLimit]);

  const loadConfirmation = useCallback(async () => {
    if (!request) return;

    const { data: freshRequest } = await supabase
      .from('ride_requests')
      .select('*')
      .eq('id', request.id)
      .single();

    if (freshRequest) {
      setRequestStatus(freshRequest.status);
      if (isPassengerSide) {
        setMyConfirmed(freshRequest.passenger_confirmed);
        setOtherConfirmed(freshRequest.driver_confirmed);
      } else if (isDriverSide) {
        setMyConfirmed(freshRequest.driver_confirmed);
        setOtherConfirmed(freshRequest.passenger_confirmed);
      }
    }
  }, [request, isPassengerSide, isDriverSide]);

  useEffect(() => {
    completionNotified.current = false;
    setMessageLimit(50);
    setRequestStatus(request?.status ?? null);
    setMyConfirmed(false); setOtherConfirmed(false); setRatingSubmitted(false);
  }, [request?.id, request?.status]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const resolvedMatch = await resolveMatch();
      if (cancelled) return;
      await Promise.all([loadMessages(resolvedMatch), loadConfirmation()]);

      const { data } = await supabase.rpc('get_my_profile');
      if (!cancelled) {
        const profile = data?.[0];
        setAuthorName(profile?.display_name ?? (isPassengerSide ? request?.passenger_name : trip.name) ?? '');
      }
    }

    initialize();

    if (request) {
      const channel = supabase
        .channel(`match-chat-${request.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `request_id=eq.${request.id}`,
          },
          (payload) => {
            const message = payload.new as Message;
            setMessages((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, message]);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'ride_requests',
            filter: `id=eq.${request.id}`,
          },
          (payload) => {
            const updatedRequest = payload.new as RideRequest;
            setRequestStatus(updatedRequest.status);
            if (isPassengerSide) {
              setMyConfirmed(updatedRequest.passenger_confirmed);
              setOtherConfirmed(updatedRequest.driver_confirmed);
            } else if (isDriverSide) {
              setMyConfirmed(updatedRequest.driver_confirmed);
              setOtherConfirmed(updatedRequest.passenger_confirmed);
            }
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        supabase.removeChannel(channel);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.name, request, userId, isPassengerSide, isDriverSide, resolveMatch, loadMessages, loadConfirmation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (bothConfirmed && !completionNotified.current) {
      completionNotified.current = true;
      setError(null);
      if (onBothConfirmed) {
        onBothConfirmed();
      }
    }
  }, [bothConfirmed, onBothConfirmed]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!request || !body.trim()) return;
    if (!canSendMessages) {
      setError(requestStatus === 'cancelled'
        ? 'Ši kelionė atšaukta, todėl naujų žinučių siųsti nebegalima.'
        : 'Žinutes galėsite siųsti, kai kelionė bus patvirtinta.');
      return;
    }

    setSending(true);
    setError(null);
    const payload: NewMessage = {
      trip_id: trip.id,
      match_id: matchId,
      request_id: request.id,
      author_id: userId,
      author_name: authorName.trim(),
      body: body.trim(),
    };
    const { data, error: sendError } = await supabase
      .from('messages')
      .insert(payload)
      .select('*')
      .single();
    setSending(false);
    if (sendError || !data) {
      setError('Nepavyko išsiųsti žinutės.');
      return;
    }
    setMessages((prev) => prev.some((item) => item.id === data.id) ? prev : [...prev, data]);
    setBody('');
  }

  async function handleConfirm() {
    if (!request) return;
    if (myConfirmed) {
      setError(null);
      return;
    }

    setConfirming(true);
    setError(null);
    const { data, error: confirmError } = await supabase.rpc('confirm_ride', { p_request_id: request.id });
    setConfirming(false);
    if (confirmError || !data) {
      setError(confirmError?.message === 'trip has not started'
        ? 'Kelionę galėsite patvirtinti po išvykimo laiko.'
        : confirmError?.message === 'ride is not accepted'
          ? 'Ši kelionė dar nepatvirtinta vairuotojo.'
          : 'Nepavyko patvirtinti kelionės.');
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
    const { error: ratingError } = await supabase.rpc('submit_rating', {
      p_trip_id: ratingTripId,
      p_rated_id: ratedId,
      p_role: role,
      p_score: rateScore,
      p_comment: rateComment.trim() || null,
      p_request_id: request.id,
    });
    setRateSubmitting(false);
    if (ratingError) {
      setError(ratingError.message.includes('already submitted') ? 'Šią kelionę jau įvertinote.' : 'Nepavyko pateikti vertinimo.');
      return;
    }
    setRatingSubmitted(true);
    setShowRateForm(false);
  }

  const priceStr = formatPrice(trip);

  function openGoogleMapsNavigation() {
    window.open(navigationUrl(trip, request), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="modal-panel chat-panel ride-dialog w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-overlay h-[90dvh] sm:h-[min(85dvh,800px)] flex flex-col" data-role={trip.role} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ChatDrawer-title">
        <div className="modal-header flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 id="ChatDrawer-title" className="text-base font-bold text-neutral-900 truncate">
              {trip.from_location} → {trip.to_location}
            </h2>
            <p className="text-xs text-neutral-500 truncate">
              {formatDateTime(trip.departure_time)}
              {priceStr && ` · ${priceStr}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openGoogleMapsNavigation}
              className="ui-button flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold active:scale-95 transition-all shadow-md "
              aria-label="Google Maps navigacija"
              title="Atidaryti Google Maps"
            >
              <Navigation className="w-4 h-4" />
              Navigacija
            </button>
            <button
              data-dialog-close onClick={onClose}
              className="ui-button flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors"
              aria-label="Uždaryti"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {hasOlderMessages && <button className="ui-button p-2 text-primary-700 text-sm" disabled={loading} onClick={() => setMessageLimit(limit => limit + 50)}>Įkelti ankstesnes žinutes</button>}
        {canConfirm && (
          <div className="flex-shrink-0 px-4 sm:px-5 py-3 bg-neutral-50 border-b border-neutral-100">
            {bothConfirmed ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center gap-2 text-success-700 text-sm font-semibold">
                  <CheckCheck className="w-5 h-5" />
                  Abi pusės patvirtino — kelionė baigta!
                </div>
                {!ratingSubmitted && (
                  <button
                    onClick={() => setShowRateForm(!showRateForm)}
                    className="ui-button text-sm text-primary-700 hover:underline flex items-center justify-center gap-1"
                  >
                    <Star className="w-4 h-4" />
                    Įvertinti {isPassengerSide ? 'vairuotoją' : 'keleivį'}
                  </button>
                )}
                {showRateForm && (
                  <div className="rounded-xl bg-surface border border-neutral-200 p-3 flex flex-col gap-2">
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
                      className="ui-button py-2.5 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
                    >
                      {rateSubmitting ? 'Siunčiama…' : 'Pateikti vertinimą'}
                    </button>
                  </div>
                )}
                {ratingSubmitted && (
                  <p className="text-center text-sm text-success-700 font-medium">
                    Ačiū už vertinimą!
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {request?.status !== 'accepted' ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-100 text-success-700 text-xs font-semibold">
                      <CheckCheck className="w-4 h-4" />
                      Kelionė patvirtinta
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        myConfirmed ? 'bg-success-100 text-success-700' : 'bg-neutral-200 text-neutral-500'
                      }`}>
                        <Check className="w-3.5 h-3.5" />
                        Jūs {myConfirmed ? 'patvirtinote' : 'nepatvirtinote'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        otherConfirmed ? 'bg-success-100 text-success-700' : 'bg-neutral-200 text-neutral-500'
                      }`}>
                        <Check className="w-3.5 h-3.5" />
                        Kita pusė {otherConfirmed ? 'patvirtino' : 'laukia'}
                      </span>
                    </div>
                    {!myConfirmed && !bothConfirmed && (
                      <button
                        onClick={handleConfirm}
                        disabled={confirming}
                        className="ui-button flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-on-primary text-sm font-semibold hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-60"
                      >
                        {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Kelionė įvyko
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                Kol kas nėra žinučių. Parašykite pirmas — derėkite dėl kainos!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.author_id === userId;
              return (
                <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 ${
                      isOwn
                        ? 'chat-message-own bg-primary-600 text-on-primary rounded-br-md'
                        : 'chat-message-other bg-neutral-100 text-neutral-800 rounded-bl-md'
                    }`}
                  >
                    <p className="text-xs font-semibold mb-0.5">{msg.author_name}</p>
                    <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.body}</p>
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-on-primary/90' : 'text-neutral-500'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {error && (
            <p className="text-sm text-danger-700 bg-danger-50 rounded-lg px-3 py-2 text-center">{error}</p>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="flex-shrink-0 border-t border-neutral-100 p-3 sm:p-4 space-y-2"
        >
          {!canSendMessages && request && (
            <p className="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-center text-sm font-medium text-warning-800" role="status">
              {requestStatus === 'cancelled'
                ? 'Pokalbis uždarytas, nes kelionė buvo atšaukta.'
                : 'Pokalbis bus aktyvus, kai kelionė bus patvirtinta.'}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={canSendMessages ? 'Rašykite žinutę…' : 'Žinučių siuntimas negalimas'}
              className="form-input flex-1"
              disabled={sending || !canSendMessages}
            />
            <button
              type="submit"
              disabled={sending || !request || !canSendMessages || !body.trim() || !authorName.trim()}
              className="ui-button flex-shrink-0 w-11 h-11 rounded-xl bg-primary-600 text-on-primary flex items-center justify-center hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
