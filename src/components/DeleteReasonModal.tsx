import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState } from 'react';
import { Trash2, Loader2, X } from 'lucide-react';
import type { TripRole } from '@/lib/supabase';

const COMMON_REASONS: Record<TripRole, string[]> = {
  driver: [
    'Kelionė jau įvyko',
    'Radau keleivį',
    'Atšaukiau kelionę',
    'Klaida skelbime',
  ],
  passenger: [
    'Kelionė jau įvyko',
    'Radau vairuotoją',
    'Atšaukiau paiešką',
    'Klaida skelbime',
  ],
};

export function DeleteReasonModal({
  role,
  onClose,
  onConfirm,
}: {
  role: TripRole;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const dialogRef = useDialogFocus();
  const [selectedCommon, setSelectedCommon] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = COMMON_REASONS[role];
  const finalReason = customReason.trim() || selectedCommon;

  async function handleConfirm() {
    if (!finalReason) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(finalReason);
    } catch {
      setError('Nepavyko pašalinti skelbimo. Bandykite dar kartą.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="modal-panel overflow-y-auto w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl shadow-overlay" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="DeleteReasonModal-title">
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center">
              <Trash2 className="w-4.5 h-4.5 text-danger-500" />
            </div>
            <h2 id="DeleteReasonModal-title" className="text-lg font-bold text-neutral-900">Pašalinti skelbimą</h2>
          </div>
          <button
            data-dialog-close onClick={onClose}
            className="ui-button w-11 h-11 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm text-neutral-500 mb-4">Nurodykite pašalinimo priežastį:</p>

          <div className="space-y-2 mb-4">
            {reasons.map((reason) => (
              <button
                key={reason}
                onClick={() => {
                  setSelectedCommon(reason);
                  setCustomReason('');
                }}
                className={`ui-button w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedCommon === reason && !customReason
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1.5">
              Kita priežastis
            </label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => {
                setCustomReason(e.target.value);
                setSelectedCommon(null);
              }}
              placeholder="Įrašykite savo priežastį…"
              className="form-input"
            />
          </div>

          {error && (
            <p className="mt-3 text-sm text-danger-700 bg-danger-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 mt-5">
            <button
              data-dialog-close onClick={onClose}
              disabled={submitting}
              className="ui-button flex-1 py-3 rounded-xl bg-neutral-100 text-neutral-700 font-semibold hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Atšaukti
            </button>
            <button
              onClick={handleConfirm}
              disabled={!finalReason || submitting}
              className="ui-button flex-1 py-3 rounded-xl bg-danger-500 text-on-primary font-semibold hover:bg-danger-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Pašalinama…</span>
                </>
              ) : (
                <span>Pašalinti</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
