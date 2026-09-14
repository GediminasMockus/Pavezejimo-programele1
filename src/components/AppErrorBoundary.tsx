import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">Įvyko klaida / Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            Programėlės būsena buvo saugiai sustabdyta. Perkraukite puslapį ir bandykite dar kartą.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 min-h-12 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Perkrauti / Reload
          </button>
        </section>
      </main>
    );
  }
}
