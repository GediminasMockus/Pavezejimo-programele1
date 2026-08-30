import { useEffect, useState } from 'react';
import { Bell, X, Check, CheckCheck, Clock, MapPin, Car, Users } from 'lucide-react';
import { supabase, type Notification } from '@/lib/supabase';
import { formatDistanceToNow } from '@/lib/format';

interface NotificationDrawerProps {
  userId: string;
  onClose: () => void;
}

export function NotificationDrawer({ userId, onClose }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();

    // Listen for new notifications
    const channel = supabase
      .channel('notifications-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.user_id === userId) {
          setNotifications(prev => [payload.new as Notification, ...prev]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new as Notification : n));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function loadNotifications() {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data);
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await supabase.rpc('mark_notification_read', { p_notification_id: id });
  }

  async function markAllAsRead() {
    await supabase.rpc('mark_all_notifications_read');
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  function getNotificationIcon(type: Notification['type']) {
    switch (type) {
      case 'request_accepted':
        return <Check className="w-5 h-5 text-emerald-600" />;
      case 'request_rejected':
        return <X className="w-5 h-5 text-red-600" />;
      case 'trip_reminder':
        return <Clock className="w-5 h-5 text-amber-600" />;
      case 'new_message':
        return <Bell className="w-5 h-5 text-blue-600" />;
      default:
        return <Bell className="w-5 h-5 text-slate-600" />;
    }
  }

  function getNotificationBg(type: Notification['type']) {
    switch (type) {
      case 'request_accepted':
        return 'bg-emerald-50 border-emerald-200';
      case 'request_rejected':
        return 'bg-red-50 border-red-200';
      case 'trip_reminder':
        return 'bg-amber-50 border-amber-200';
      case 'new_message':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-5 h-5 text-slate-700" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900">Pranešimai</h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Pažymėti visus
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Bell className="w-6 h-6 animate-pulse mb-2" />
              <p className="text-sm">Įkeliama…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Bell className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm">Nėra pranešimų</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50' : ''}`}
                  onClick={() => {
                    if (!notification.read) markAsRead(notification.id);
                  }}
                >
                  <div className="flex gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${getNotificationBg(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                        {!notification.read && (
                          <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-slate-400 mt-2">
                        {formatDistanceToNow(new Date(notification.created_at))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
