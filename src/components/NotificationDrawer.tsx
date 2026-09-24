import { useDialogFocus } from '@/lib/useDialogFocus';
import { useCallback, useEffect, useState } from 'react';
import { Bell, X, Check, Clock, Route, Car, Users } from 'lucide-react';
import { supabase, type Notification, type TripRole } from '@/lib/supabase';
import { formatDistanceToNow } from '@/lib/format';
import { isNotificationFresh, notificationCutoff } from '@/lib/notificationRetention';

interface NotificationDrawerProps {
  userId: string;
  onClose: () => void;
  onOpenMatch?: (tripId: string, matchedTripRole: TripRole) => void;
  onOpenRole?: (role: TripRole) => void;
  onOpenChat?: (requestId: string) => void;
}

export function NotificationDrawer({ userId, onClose, onOpenMatch, onOpenRole, onOpenChat }: NotificationDrawerProps) {
  const dialogRef = useDialogFocus();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const relevantSince = notificationCutoff();
    const cleanup = supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', relevantSince);
    const query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', relevantSince)
      .order('created_at', { ascending: false })
      .limit(50);
    const [, { data }] = await Promise.all([cleanup, query]);
    if (data) setNotifications((data as Notification[]).filter(item => isNotificationFresh(item.created_at)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadNotifications();

    // Listen for new notifications
    const channel = supabase
      .channel('notifications-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const notification = payload.new as Notification;
        if (notification.user_id === userId && isNotificationFresh(notification.created_at)) {
          setNotifications(prev =>
            prev.some(item => item.id === notification.id)
              ? prev
              : [notification, ...prev],
          );
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
        const notification = payload.new as Notification;
        setNotifications(prev => {
          if (!isNotificationFresh(notification.created_at)) {
            return prev.filter(item => item.id !== notification.id);
          }
          return prev.some(item => item.id === notification.id)
            ? prev.map(item => item.id === notification.id ? notification : item)
            : [notification, ...prev];
        });
      })
      .subscribe();

    const expiryTimer = window.setInterval(() => {
      setNotifications(items => items.filter(item => isNotificationFresh(item.created_at)));
    }, 60_000);

    return () => {
      window.clearInterval(expiryTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);


  async function markAsRead(id: string) {
    setNotifications(items =>
      items.map(item => item.id === id ? { ...item, read: true } : item),
    );
    const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
    if (error) void loadNotifications();
  }

  async function markAllAsRead() {
    setNotifications(items => items.map(item => ({ ...item, read: true })));
    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (error) void loadNotifications();
  }

  const unreadCount = notifications.filter(notification => !notification.read).length;

  function getNotificationIcon(type: Notification['type']) {
    switch (type) {
      case 'request_accepted':
        return <Check className="w-5 h-5 text-success-700" />;
      case 'request_rejected':
      case 'request_cancelled':
        return <X className="w-5 h-5 text-danger-700" />;
      case 'trip_reminder':
      case 'trip_expiry':
        return <Clock className="w-5 h-5 text-warning-700" />;
      case 'new_offer':
        return <Car className="w-5 h-5 text-primary-700" />;
      case 'new_request':
        return <Users className="w-5 h-5 text-primary-700" />;
      case 'new_message':
        return <Bell className="w-5 h-5 text-primary-700" />;
      case 'auto_match':
      case 'auto_match_driver':
      case 'auto_match_passenger':
        return <Route className="w-5 h-5 text-primary-700" />;
      default:
        return <Bell className="w-5 h-5 text-neutral-600" />;
    }
  }

  function getNotificationBg(type: Notification['type']) {
    switch (type) {
      case 'request_accepted':
        return 'bg-success-50 border-success-200';
      case 'request_rejected':
      case 'request_cancelled':
        return 'bg-danger-50 border-danger-200';
      case 'trip_reminder':
      case 'trip_expiry':
        return 'bg-warning-50 border-warning-200';
      case 'new_offer':
        return 'bg-primary-50 border-primary-200';
      case 'new_request':
        return 'bg-primary-50 border-primary-200';
      case 'new_message':
        return 'bg-primary-50 border-primary-200';
      case 'auto_match':
      case 'auto_match_driver':
      case 'auto_match_passenger':
        return 'bg-primary-50 border-primary-200';
      default:
        return 'bg-neutral-50 border-neutral-200';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end overscroll-none bg-overlay/50 backdrop-blur-sm p-2 sm:p-4">
      <div className="notification-panel" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="notifications-title">
        {/* Header */}
        <div className="modal-header flex-wrap gap-2 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative">
              <Bell className="w-5 h-5 text-neutral-700" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-primary-600 text-on-primary text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <h2 id="notifications-title" className="text-base font-semibold text-neutral-900">Pranešimai</h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="ui-button px-1 text-xs text-primary-700 hover:text-primary-800 font-medium"
              >
                Pažymėti visus
              </button>
            )}
            <button
              data-dialog-close onClick={onClose}
              aria-label="Uždaryti pranešimus"
              className="ui-button w-11 h-11 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications list */}
        <div className="notification-list">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
              <Bell className="w-6 h-6 animate-pulse mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
              <Bell className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm">Naujų ar nesenų pranešimų nėra</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {notifications.map((notification) => {
                const matchedTripRole =
                  notification.type === 'auto_match_driver'
                    ? 'driver'
                    : notification.type === 'auto_match_passenger'
                      ? 'passenger'
                      : null;
                const targetRole: TripRole | null =
                  notification.type === 'new_offer'
                    ? 'passenger'
                    : notification.type === 'new_request'
                      ? 'driver'
                      : null;
                const canOpenMatch = Boolean(matchedTripRole && notification.related_trip_id && onOpenMatch);
                const canOpenRole = Boolean(targetRole && onOpenRole);
                const canOpenChat = Boolean(
                  notification.type === 'new_message'
                  && notification.related_request_id
                  && onOpenChat,
                );
                const actionLabel = canOpenChat
                  ? 'Atidaryti pokalbį'
                  : canOpenMatch
                  ? 'Peržiūrėti kelionę'
                  : notification.type === 'new_offer'
                    ? 'Peržiūrėti pasiūlymą'
                    : notification.type === 'new_request'
                      ? 'Peržiūrėti užklausą'
                      : null;

                return (
                <button
                  type="button"
                  key={notification.id}
                  className={`notification-row ${!notification.read ? 'notification-row-unread' : ''}`}
                  onClick={() => {
                    if (!notification.read) void markAsRead(notification.id);
                    if (canOpenChat && notification.related_request_id) {
                      onOpenChat?.(notification.related_request_id);
                    } else if (canOpenMatch && matchedTripRole && notification.related_trip_id) {
                      onOpenMatch?.(notification.related_trip_id, matchedTripRole);
                    } else if (canOpenRole && targetRole) {
                      onOpenRole?.(targetRole);
                    }
                  }}
                  aria-label={actionLabel ? `${notification.title} – ${actionLabel.toLocaleLowerCase('lt-LT')}` : notification.title}
                >
                  <div className="flex gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${getNotificationBg(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-neutral-900">{notification.title}</p>
                        {!notification.read && (
                          <span className="flex-shrink-0 w-2 h-2 bg-primary-500 rounded-full mt-1.5" />
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 mt-1 line-clamp-2">{notification.message}</p>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2">
                        <p className="text-xs text-neutral-500">
                          {formatDistanceToNow(new Date(notification.created_at))}
                        </p>
                        {actionLabel && (canOpenChat || canOpenMatch || canOpenRole) && (
                          <span className="text-xs font-semibold text-primary-700">
                            {actionLabel} →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
