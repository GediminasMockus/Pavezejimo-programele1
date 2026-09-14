import { useState } from 'react';
import { Route, Mail, Lock, User, Loader2, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Background } from '@/components/Background';
import { useLanguage } from '@/lib/useLanguage';

const EMAIL_CONFIRM_REDIRECT = 'https://pavezejimo-programele1.vercel.app/';

export function AuthScreen() {
  const { isEnglish } = useLanguage();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <Background />
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-600 to-emerald-500 shadow-lg shadow-blue-500/30 mb-4">
          <Route className="w-8 h-8 text-white" strokeWidth={2.2} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Priemiesčio Pavežėjimai
        </h1>
        <p className="mt-2 text-slate-500 text-sm">
          {mode === 'signin'
            ? (isEnglish ? 'Sign in to continue' : 'Prisijunkite, kad tęstumėte')
            : (isEnglish ? 'Create an account to get started' : 'Sukurkite paskyrą, kad pradėtumėte')}
        </p>
      </div>

      <div className="w-full max-w-sm">
        {notice && <p role="status" className="p-3 mb-3 bg-blue-50 text-blue-700 rounded-xl">{notice}</p>}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8">
          <div className="flex rounded-full bg-slate-100 p-1 mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); setNotice(''); }}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {isEnglish ? 'Sign in' : 'Prisijungti'}
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setNotice(''); }}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {isEnglish ? 'Register' : 'Registruotis'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <label className="block">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                    <User className="w-4 h-4 text-slate-400" />
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
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                    <Phone className="w-4 h-4 text-slate-400" />
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
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                <Mail className="w-4 h-4 text-slate-400" />
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

            <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                <Lock className="w-4 h-4 text-slate-400" />
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
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/25 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{mode === 'signin'
                    ? (isEnglish ? 'Signing in…' : 'Jungiamasi…')
                    : (isEnglish ? 'Creating…' : 'Kuriama…')}</span>
                </>
              ) : (
                <span>{mode === 'signin'
                  ? (isEnglish ? 'Sign in' : 'Prisijungti')
                  : (isEnglish ? 'Register' : 'Registruotis')}</span>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {mode === 'signin'
            ? (isEnglish ? "Don't have an account? " : 'Neturite paskyros? ')
            : (isEnglish ? 'Already have an account? ' : 'Turite paskyrą? ')}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(''); }}
            className="text-blue-600 font-semibold hover:underline"
          >
            {mode === 'signin'
              ? (isEnglish ? 'Register' : 'Registruokitės')
              : (isEnglish ? 'Sign in' : 'Prisijunkite')}
          </button>
        </p>
      </div>
    </div>
  );
}
