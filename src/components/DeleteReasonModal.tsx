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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm px-0 sm:px-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-4.5 h-4.5 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Pašalinti skelbimą</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Uždaryti"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm text-slate-500 mb-4">Nurodykite pašalinimo priežastį:</p>

          <div className="space-y-2 mb-4">
            {reasons.map((reason) => (
              <button
                key={reason}
                onClick={() => {
                  setSelectedCommon(reason);
                  setCustomReason('');
                }}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedCommon === reason && !customReason
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
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
            <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Atšaukti
            </button>
            <button
              onClick={handleConfirm}
              disabled={!finalReason || submitting}
              className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
