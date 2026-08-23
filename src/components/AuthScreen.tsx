import { useState } from 'react';
import { Route, Mail, Lock, User, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Background } from '@/components/Background';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Įveskite el. paštą ir slaptažodį.');
      return;
    }
    if (password.length < 6) {
      setError('Slaptažodis turi būti bent 6 simbolių.');
      return;
    }

    setLoading(true);

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message === 'User already registered'
          ? 'Vartotojas su tokiu el. paštu jau užregistruotas.'
          : error.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        const { error: profileError } = await supabase.from('user_profiles').upsert({
          id: data.user.id,
          display_name: name.trim() || email.split('@')[0],
          email: email.trim(),
        });
        if (profileError) {
          // Profile might already exist, try update
          await supabase.from('user_profiles')
            .update({ display_name: name.trim() || email.split('@')[0], email: email.trim() })
            .eq('id', data.user.id);
        }
      }
      setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'Neteisingas el. paštas arba slaptažodis.'
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
          {mode === 'signin' ? 'Prisijunkite, kad tęstumėte' : 'Sukurkite paskyrą, kad pradėtumėte'}
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8">
          <div className="flex rounded-full bg-slate-100 p-1 mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Prisijungti
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Registruotis
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                  <User className="w-4 h-4 text-slate-400" />
                  Vardas
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="pvz. Jonas"
                  className="form-input"
                />
              </label>
            )}

            <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                <Mail className="w-4 h-4 text-slate-400" />
                El. paštas
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vardas@pavyzdys.lt"
                className="form-input"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-1.5">
                <Lock className="w-4 h-4 text-slate-400" />
                Slaptažodis
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Bent 6 simboliai"
                className="form-input"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
                  <span>{mode === 'signin' ? 'Jungiamasi…' : 'Kuriama…'}</span>
                </>
              ) : (
                <span>{mode === 'signin' ? 'Prisijungti' : 'Registruotis'}</span>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {mode === 'signin' ? 'Neturite paskyros? ' : 'Turite paskyrą? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
            className="text-blue-600 font-semibold hover:underline"
          >
            {mode === 'signin' ? 'Registruokitės' : 'Prisijunkite'}
          </button>
        </p>
      </div>
    </div>
  );
}
