export const NOTIFICATION_RETENTION_MS = 48 * 60 * 60 * 1000;

export function notificationCutoff(now = Date.now()) {
  return new Date(now - NOTIFICATION_RETENTION_MS).toISOString();
}

export function isNotificationFresh(createdAt: string, now = Date.now()) {
  return new Date(createdAt).getTime() >= now - NOTIFICATION_RETENTION_MS;
}
