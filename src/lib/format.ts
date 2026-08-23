import type { Trip } from '@/lib/supabase';

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('lt-LT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

export function formatPrice(trip: Pick<Trip, 'price' | 'price_unit'>): string | null {
  if (trip.price === null || trip.price === undefined) return null;
  const formatted = Number(trip.price).toLocaleString('lt-LT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} € / ${trip.price_unit}`;
}

export function toLocalInput(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}
