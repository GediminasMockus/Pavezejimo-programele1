import { useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Toast) => {
    const id = Math.random().toString(36).substring(7);
    const newToast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);
    
    const duration = toast.duration ?? 3000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const success = useCallback((message: string, duration?: number) => {
    addToast({ type: 'success', message, duration });
  }, [addToast]);

  const error = useCallback((message: string, duration?: number) => {
    addToast({ type: 'error', message, duration });
  }, [addToast]);

  const info = useCallback((message: string, duration?: number) => {
    addToast({ type: 'info', message, duration });
  }, [addToast]);

  const warning = useCallback((message: string, duration?: number) => {
    addToast({ type: 'warning', message, duration });
  }, [addToast]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, success, error, info, warning, remove };
}

export const toast = {
  success: (message: string, duration?: number) => {
    toastListeners.forEach(listener => listener({ type: 'success', message, duration }));
  },
  error: (message: string, duration?: number) => {
    toastListeners.forEach(listener => listener({ type: 'error', message, duration }));
  },
  info: (message: string, duration?: number) => {
    toastListeners.forEach(listener => listener({ type: 'info', message, duration }));
  },
  warning: (message: string, duration?: number) => {
    toastListeners.forEach(listener => listener({ type: 'warning', message, duration }));
  },
};
