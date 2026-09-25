import { useState } from 'react';
import { Bug, Lightbulb, Loader2, MessageCircle, Star, X } from 'lucide-react';
import { supabase, type TripRole } from '@/lib/supabase';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useLanguage } from '@/lib/useLanguage';

type FeedbackCategory = 'problem' | 'suggestion' | 'rating';

function FeedbackDialog({ screen, role, onClose }: { screen: 'home' | 'list'; role: TripRole | null; onClose: () => void }) {
  const dialogRef = useDialogFocus();
  const { isEnglish } = useLanguage();
  const [category, setCategory] = useState<FeedbackCategory>('problem');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const labels = isEnglish
    ? { title: 'Feedback', problem: 'Report a problem', suggestion: 'Suggest an improvement', rating: 'Rate the app', comment: 'Your message', optional: 'Comment (optional)', send: 'Send feedback', sending: 'Sending…', thankYou: 'Thank you! Your feedback was sent.', close: 'Close', missing: 'Please describe your feedback.', choose: 'Choose a rating.', failure: 'Could not send feedback. Please try again.', context: 'The current screen and browser details will be included to help us investigate.' }
    : { title: 'Atsiliepimai', problem: 'Pranešti problemą', suggestion: 'Pasiūlyti patobulinimą', rating: 'Įvertinti programėlę', comment: 'Jūsų žinutė', optional: 'Komentaras (neprivalomas)', send: 'Siųsti atsiliepimą', sending: 'Siunčiama…', thankYou: 'Ačiū! Atsiliepimas išsiųstas.', close: 'Uždaryti', missing: 'Aprašykite savo pastebėjimą.', choose: 'Pasirinkite įvertinimą.', failure: 'Nepavyko išsiųsti. Bandykite dar kartą.', context: 'Kad galėtume ištirti problemą, pridėsime dabartinį ekraną ir naršyklės informaciją.' };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (category !== 'rating' && !message.trim()) { setError(labels.missing); return; }
    if (category === 'rating' && !rating) { setError(labels.choose); return; }
    setSaving(true);
    const { error: saveError } = await supabase.from('app_feedback').insert({
      category,
      message: message.trim(),
      rating: category === 'rating' ? rating : null,
      screen,
      role,
      // Exclude query strings and hashes: reset links can contain temporary credentials.
      page_url: `${window.location.origin}${window.location.pathname}`.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 500),
      app_version: 'beta-2026-09',
    });
    setSaving(false);
    if (saveError) { setError(labels.failure); return; }
    setSent(true);
  }

  return <div className="fixed inset-0 z-[60] flex items-end justify-center overscroll-none bg-overlay/50 px-0 backdrop-blur-sm sm:items-center sm:px-4">
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="modal-panel feedback-panel w-full max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 shadow-overlay sm:max-w-md sm:rounded-3xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="feedback-title" className="text-xl font-bold text-neutral-900">{labels.title}</h2>
        <button type="button" data-dialog-close onClick={onClose} aria-label={labels.close} className="ui-button flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"><X className="h-5 w-5" /></button>
      </div>
      {sent ? <div role="status" className="py-8 text-center text-primary-700 font-semibold">{labels.thankYou}</div> : <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div role="group" aria-label={labels.title} className="grid gap-2">
          {([['problem', Bug, labels.problem], ['suggestion', Lightbulb, labels.suggestion], ['rating', Star, labels.rating]] as const).map(([value, Icon, label]) => (
            <button key={value} type="button" data-category={value} aria-pressed={category === value} onClick={() => { setCategory(value); setError(''); }} className={`ui-button flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold ${category === value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-700'}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
        {category === 'rating' && <div role="group" aria-label={labels.rating} className="flex gap-1">
          {[1, 2, 3, 4, 5].map(score => <button key={score} type="button" aria-label={`${score} / 5`} aria-pressed={rating === score} onClick={() => setRating(score)} className="ui-button flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100"><Star className={`h-7 w-7 ${score <= rating ? 'fill-primary-400 text-primary-500' : 'text-neutral-400'}`} /></button>)}
        </div>}
        <label className="text-sm font-semibold text-neutral-700">{category === 'rating' ? labels.optional : labels.comment}
          <textarea className="form-input mt-1.5 min-h-28 resize-y" maxLength={2000} required={category !== 'rating'} value={message} onChange={event => setMessage(event.target.value)} />
        </label>
        <p className="text-xs text-neutral-500">{labels.context}</p>
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <button type="submit" disabled={saving} className="ui-button flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 font-semibold text-on-primary disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? labels.sending : labels.send}</button>
      </form>}
    </div>
  </div>;
}

export function AppFeedback({ screen, role }: { screen: 'home' | 'list'; role: TripRole | null }) {
  const [open, setOpen] = useState(false);
  const { isEnglish } = useLanguage();
  return <>
    <button type="button" onClick={() => setOpen(true)} className="ui-button feedback-trigger fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-card" aria-label={isEnglish ? 'Send app feedback' : 'Siųsti atsiliepimą apie programėlę'}>
      <MessageCircle className="h-4 w-4" />{isEnglish ? 'Feedback' : 'Atsiliepimai'}<span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold">BETA</span>
    </button>
    {open && <FeedbackDialog screen={screen} role={role} onClose={() => setOpen(false)} />}
  </>;
}
