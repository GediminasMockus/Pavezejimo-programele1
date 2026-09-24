import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Toast } from '@/lib/useToast';

const TOAST_STYLES = {
  success: 'bg-success-50 border-success-200 text-success-800',
  error: 'bg-danger-50 border-danger-200 text-danger-800',
  info: 'bg-primary-50 border-primary-200 text-primary-800',
  warning: 'bg-warning-50 border-warning-200 text-warning-800',
};

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

export function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const Icon = ICONS[toast.type];
  
  return (
    <div role={toast.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-card animate-slide-in ${TOAST_STYLES[toast.type]}`}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="text-sm font-medium min-w-0 break-words flex-1">{toast.message}</p>
      <button
        aria-label="Uždaryti pranešimą"
        onClick={() => onRemove(toast.id)}
        className="ui-button flex-shrink-0 w-11 h-11 rounded-xl hover:bg-neutral-900/10 flex items-center justify-center transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
