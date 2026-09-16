import type { Trip } from '@/lib/supabase';
import { getLanguage } from '@/lib/useLanguage';

function locale() {
  return getLanguage() === 'en' ? 'en-GB' : 'lt-LT';
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatPrice(trip: Pick<Trip, 'price' | 'price_unit'>): string | null {
  if (trip.price === null || trip.price === undefined) return null;
  const language = getLanguage();
  const formatted = Number(trip.price).toLocaleString(language === 'en' ? 'en-GB' : 'lt-LT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const unit = language === 'en'
    ? (trip.price_unit === 'asmeniui' ? 'person' : 'total')
    : trip.price_unit;
  return `${formatted} € / ${unit}`;
}

export function toLocalInput(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

const NON_RECURRING_TRIP_RETENTION_MS = 24 * 60 * 60 * 1000;

export function formatTripExpiryCountdown(departureTime: string, currentTime: number): string | null {
  const departureMs = new Date(departureTime).getTime();
  if (!Number.isFinite(departureMs) || currentTime < departureMs) return null;

  const remainingMs = departureMs + NON_RECURRING_TRIP_RETENTION_MS - currentTime;
  if (remainingMs <= 0) return 'Skelbimo galiojimas pasibaigė – bus netrukus pašalintas.';

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `Iki automatinio ištrynimo liko ${minutes} min.`;
  if (minutes === 0) return `Iki automatinio ištrynimo liko ${hours} val.`;
  return `Iki automatinio ištrynimo liko ${hours} val. ${minutes} min.`;
}

export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const language = getLanguage();

  if (language === 'en') {
    if (diffInSeconds < 60) return 'a few seconds ago';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hr ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  if (diffInSeconds < 60) return 'prieš kelias sekundes';
  if (diffInSeconds < 3600) return `prieš ${Math.floor(diffInSeconds / 60)} min.`;
  if (diffInSeconds < 86400) return `prieš ${Math.floor(diffInSeconds / 3600)} val.`;
  if (diffInSeconds < 604800) return `prieš ${Math.floor(diffInSeconds / 86400)} d.`;

  return date.toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' });
}
