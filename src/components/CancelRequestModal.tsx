import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { RideRequest } from '@/lib/supabase';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

export function CancelRequestModal({
  request,
  onClose,
  onConfirm,
}: {
  request: RideRequest;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useBodyScrollLock();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAccepted = request.status === 'accepted';
  const itemName = isAccepted
    ? 'kelionę'
    : request.request_type === 'driver_offer'
      ? 'pasiūlymą'
      : 'užklausą';

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('Nepavyko atšaukti. Bandykite dar kartą.');
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 px-0 backdrop-blur-sm sm:items-center sm:px-4" role="presentation">
      <div className="w-full rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="cancel-request-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 id="cancel-request-title" className="text-lg font-bold text-slate-900">
              Atšaukti {itemName}?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              {request.pickup_location} → {request.dropoff_location}
            </p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            {isAccepted
              ? 'Kita pusė gaus pranešimą, o šios kelionės pokalbis bus uždarytas.'
              : 'Kita pusė gaus pranešimą, kad šis susitarimas atšauktas.'}
            {' '}Šio veiksmo atšaukti nebegalėsite.
          </p>

          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-12 flex-1 rounded-2xl bg-slate-100 px-4 font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
            >
              Ne, grįžti
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {submitting ? 'Atšaukiama…' : `Taip, atšaukti ${itemName}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
