import { useEffect, useRef } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

const openDialogs: HTMLElement[] = [];

/** Keep keyboard navigation and scrolling inside the active modal. */
export function useDialogFocus() {
  const ref = useRef<HTMLDivElement>(null);
  useBodyScrollLock();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(dialog);
    const isTopmost = () => openDialogs[openDialogs.length - 1] === dialog;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const focusStart = () => (dialog.querySelector<HTMLButtonElement>('[data-dialog-close]:not(:disabled)') ?? focusable()[0] ?? dialog).focus({ preventScroll: true });
    focusStart();

    const handleKey = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        const close = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]:not(:disabled)');
        if (close) { event.preventDefault(); close.click(); }
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (isTopmost() && !dialog.contains(event.target as Node)) focusStart();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      const wasTopmost = isTopmost();
      const index = openDialogs.indexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      if (wasTopmost && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
