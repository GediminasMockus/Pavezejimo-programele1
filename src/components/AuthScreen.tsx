import { useState } from 'react';
import { Route, Mail, Lock, User, Loader2, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Background } from '@/components/Background';
import { useLanguage } from '@/lib/useLanguage';

const EMAIL_CONFIRM_REDIRECT = 'https://pavezejimo-programele1.vercel.app/';

export function AuthScreen() {
  const { isEnglish } = useLanguage();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice('');

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError(isEnglish ? 'Enter your email.' : 'Įveskite el. paštą.');
        return;
      }
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: EMAIL_CONFIRM_REDIRECT,
      });
      setLoading(false);
      if (resetError) setError(isEnglish ? 'Could not send the link. Try again later.' : 'Nepavyko išsiųsti nuorodos. Bandykite vėliau.');
      else setNotice(isEnglish ? 'If this address has an account, you will receive a password reset link.' : 'Jei šiuo adresu yra paskyra, gausite slaptažodžio atkūrimo nuorodą.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError(isEnglish ? 'Enter your email and password.' : 'Įveskite el. paštą ir slaptažodį.');
      return;
    }
    if (mode === 'signin' && password.length < 6) {
      setError(isEnglish ? 'Password must be at least 6 characters.' : 'Slaptažodis turi būti bent 6 simbolių.');
      return;
    }
    if (mode === 'signup') {
      const phoneDigits = phone.replace(/\D/g, '');
      if (!phone.trim()) {
        setError(isEnglish ? 'Phone number is required.' : 'Telefono numeris yra privalomas.');
        return;
      }
      if (phoneDigits.length < 8 || phoneDigits.length > 15) {
        setError(isEnglish ? 'Enter a valid phone number.' : 'Įveskite teisingą telefono numerį.');
        return;
      }
      if (password.length < 10) {
        setError(isEnglish ? 'Password must be at least 10 characters.' : 'Slaptažodis turi būti bent 10 simbolių.');
        return;
      }
    }

    setLoading(true);

    if (mode === 'signup') {
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.trim();
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: EMAIL_CONFIRM_REDIRECT,
          data: {
            display_name: name.trim() || trimmedEmail.split('@')[0],
            phone: trimmedPhone,
          },
        },
      });
      if (error) {
        setError(error.message === 'User already registered'
          ? (isEnglish ? 'A user with this email is already registered.' : 'Vartotojas su tokiu el. paštu jau užregistruotas.')
          : error.message);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setNotice(isEnglish
          ? 'Check your email and confirm your registration using the link we sent you. Then sign in.'
          : 'Patikrinkite el. paštą ir patvirtinkite registraciją paspausdami atsiųstą nuorodą. Tada prisijunkite.');
      }
      setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? (isEnglish ? 'Incorrect email or password.' : 'Neteisingas el. paštas arba slaptažodis.')
          : error.message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <Background />
      <div className="text-center mb-8">
        <div className="auth-logo inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 shadow-card mb-4">
          <Route className="w-8 h-8 text-on-primary" strokeWidth={2.2} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
          Priemiesčio Pavežėjimai
        </h1>
        <span className="mt-2 inline-flex rounded-full bg-primary-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-primary-700">BETA</span>
        <p className="mt-2 text-neutral-500 text-sm">
          {mode === 'signin'
            ? (isEnglish ? 'Sign in to continue' : 'Prisijunkite, kad tęstumėte')
            : mode === 'signup'
              ? (isEnglish ? 'Create an account to get started' : 'Sukurkite paskyrą, kad pradėtumėte')
              : (isEnglish ? 'Enter your email to reset your password' : 'Įveskite el. paštą slaptažodžiui atkurti')}
        </p>
      </div>

      <div className="w-full max-w-sm">
        {notice && <p role="status" className="p-3 mb-3 bg-primary-50 text-primary-700 rounded-xl">{notice}</p>}
        <div className="auth-card bg-surface rounded-3xl shadow-card border border-primary-200 p-6 sm:p-8">
          {mode !== 'forgot' && <div className="auth-toggle flex rounded-xl border border-primary-200 bg-primary-100 p-1 mb-6">
            <button
              aria-pressed={mode === 'signin'}
              onClick={() => { setMode('signin'); setError(null); setNotice(''); }}
              className={`ui-button flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === 'signin' ? 'bg-surface text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {isEnglish ? 'Sign in' : 'Prisijungti'}
            </button>
            <button
              aria-pressed={mode === 'signup'}
              onClick={() => { setMode('signup'); setError(null); setNotice(''); }}
              className={`ui-button flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-surface text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {isEnglish ? 'Register' : 'Registruotis'}
            </button>
          </div>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <label className="block">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-1.5">
                    <User className="w-4 h-4 text-neutral-500" />
                    {isEnglish ? 'Name' : 'Vardas'}
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isEnglish ? 'e.g. Jonas' : 'pvz. Jonas'}
                    className="form-input"
                    autoComplete="name"
                  />
                </label>

                <label className="block">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-1.5">
                    <Phone className="w-4 h-4 text-neutral-500" />
                    {isEnglish ? 'Phone number' : 'Telefono numeris'}
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+370 6xx xxxxx"
                    className="form-input"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-1.5">
                <Mail className="w-4 h-4 text-neutral-500" />
                {isEnglish ? 'Email' : 'El. paštas'}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vardas@pavyzdys.lt"
                className="form-input"
                autoComplete="email"
                required
              />
            </label>

            {mode !== 'forgot' && <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 mb-1.5">
                <Lock className="w-4 h-4 text-neutral-500" />
                {isEnglish ? 'Password' : 'Slaptažodis'}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup'
                  ? (isEnglish ? 'At least 10 characters' : 'Bent 10 simbolių')
                  : (isEnglish ? 'Password' : 'Slaptažodis')}
                className="form-input"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </label>}

            {mode === 'signin' && <button type="button" onClick={() => { setMode('forgot'); setError(null); setNotice(''); }} className="ui-button self-end text-sm font-semibold text-primary-700 hover:underline">
              {isEnglish ? 'Forgot your password?' : 'Pamiršote slaptažodį?'}
            </button>}

            {error && (
              <p className="text-sm text-danger-700 bg-danger-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ui-button mt-2 w-full py-3.5 rounded-xl bg-primary-600 text-on-primary font-semibold shadow-card hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{mode === 'signin'
                    ? (isEnglish ? 'Signing in…' : 'Jungiamasi…')
                    : mode === 'signup' ? (isEnglish ? 'Creating…' : 'Kuriama…') : (isEnglish ? 'Sending…' : 'Siunčiama…')}</span>
                </>
              ) : (
                <span>{mode === 'signin'
                  ? (isEnglish ? 'Sign in' : 'Prisijungti')
                  : mode === 'signup' ? (isEnglish ? 'Register' : 'Registruotis') : (isEnglish ? 'Send reset link' : 'Siųsti atkūrimo nuorodą')}</span>
              )}
            </button>
          </form>
        </div>

        {mode === 'forgot' ? <button type="button" onClick={() => { setMode('signin'); setError(null); setNotice(''); }} className="ui-button block mx-auto mt-6 text-sm font-semibold text-primary-700 hover:underline">
          {isEnglish ? 'Back to sign in' : 'Grįžti į prisijungimą'}
        </button> : <p className="mt-6 text-center text-xs text-neutral-500">
          {mode === 'signin'
            ? (isEnglish ? "Don't have an account? " : 'Neturite paskyros? ')
            : (isEnglish ? 'Already have an account? ' : 'Turite paskyrą? ')}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(''); }}
            className="ui-button text-primary-700 font-semibold hover:underline"
          >
            {mode === 'signin'
              ? (isEnglish ? 'Register' : 'Registruokitės')
              : (isEnglish ? 'Sign in' : 'Prisijunkite')}
          </button>
        </p>}
      </div>
    </div>
  );
}

export function PasswordRecoveryScreen({ onComplete }: { onComplete: () => void }) {
  const { isEnglish } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 10) {
      setError(isEnglish ? 'Password must be at least 10 characters.' : 'Slaptažodis turi būti bent 10 simbolių.');
      return;
    }
    if (password !== confirmation) {
      setError(isEnglish ? 'Passwords do not match.' : 'Slaptažodžiai nesutampa.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(isEnglish ? 'Could not change the password. Request a new link.' : 'Nepavyko pakeisti slaptažodžio. Paprašykite naujos nuorodos.');
      return;
    }
    onComplete();
  }

  return <div className="min-h-screen flex items-center justify-center px-4 py-10">
    <Background />
    <form onSubmit={handleReset} className="relative w-full max-w-sm auth-card bg-surface rounded-3xl shadow-card border border-primary-200 p-6 sm:p-8 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-neutral-900">{isEnglish ? 'Set a new password' : 'Nustatykite naują slaptažodį'}</h1>
      <label className="text-sm font-medium text-neutral-700">{isEnglish ? 'New password' : 'Naujas slaptažodis'}
        <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={event => setPassword(event.target.value)} className="form-input mt-1.5" />
      </label>
      <label className="text-sm font-medium text-neutral-700">{isEnglish ? 'Confirm password' : 'Pakartokite slaptažodį'}
        <input type="password" autoComplete="new-password" minLength={10} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="form-input mt-1.5" />
      </label>
      {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
      <button type="submit" disabled={loading} className="ui-button min-h-12 rounded-xl bg-primary-600 text-on-primary font-semibold disabled:opacity-60">{loading ? (isEnglish ? 'Saving…' : 'Saugoma…') : (isEnglish ? 'Save password' : 'Išsaugoti slaptažodį')}</button>
      <button type="button" onClick={async () => { await supabase.auth.signOut(); onComplete(); }} className="ui-button text-sm font-semibold text-primary-700">{isEnglish ? 'Back to sign in' : 'Grįžti į prisijungimą'}</button>
    </form>
  </div>;
}
