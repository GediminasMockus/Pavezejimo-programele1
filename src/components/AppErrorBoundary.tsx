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
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-6">
        <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-surface p-6 text-center shadow-card">
          <h1 className="text-xl font-bold text-neutral-900">Įvyko klaida / Something went wrong</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Programėlės būsena buvo saugiai sustabdyta. Perkraukite puslapį ir bandykite dar kartą.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ui-button mt-5 min-h-12 w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-on-primary hover:bg-primary-700"
          >
            Perkrauti / Reload
          </button>
        </section>
      </main>
    );
  }
}
