import { useEffect, useMemo, useState, useCallback } from 'react';
import { withRetry } from '@/lib/retry';
import {
  Car,
  Users,
  ArrowLeft,
  Plus,
  Route,
  Loader2,
  Map as MapIcon,
  List,
  Grid,
  Bell,
  Inbox,
  Shield,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  supabase,
  type Trip,
  type TripRole,
  type RideRequest,
  type RequestStatus,
  type UserProfile,
} from '@/lib/supabase';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { TripForm } from '@/components/TripForm';
import { TripCard } from '@/components/TripCard';
import { ChatDrawer } from '@/components/ChatDrawer';
import { DeleteReasonModal } from '@/components/DeleteReasonModal';
import { MapView, useGeolocation, type MapMarker } from '@/components/MapView';
import { RequestModal } from '@/components/RequestModal';
import { RequestCard } from '@/components/RequestCard';
import { OfferModal } from '@/components/OfferModal';
import { FilterBar, applyFilters, emptyFilters, type FilterState } from '@/components/FilterBar';
import { RoutePreviewModal } from '@/components/RoutePreviewModal';
import { UserProfileModal } from '@/components/UserProfileModal';
import { AdminLogs } from '@/components/AdminLogs';
import { AuthScreen } from '@/components/AuthScreen';
import { Background } from '@/components/Background';
import { SettingsModal } from '@/components/SettingsModal';
import { NotificationDrawer } from '@/components/NotificationDrawer';

type Screen = 'home' | 'list';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [activeRole, setActiveRole] = useState<TripRole | null>(null);
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { toasts, success, error, info, warning, remove } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Background />
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  const userId = session.user.id;

  return (
    <div className="min-h-screen text-slate-800">
      <Background />
      <ToastContainer toasts={toasts} onRemove={remove} />
      {screen === 'home' && (
        <HomeScreen
          userId={userId}
          onPick={(role) => {
            setActiveRole(role);
            setScreen('list');
          }}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {screen === 'list' && activeRole && (
        <ListScreen
          role={activeRole}
          userId={userId}
          onBack={() => {
            setScreen('home');
            setActiveRole(null);
          }}
          toast={{ success, error, info, warning }}
        />
      )}
    </div>
  );
}

function HomeScreen({ userId, onPick, onSignOut }: { userId: string; onPick: (role: TripRole) => void; onSignOut: () => void }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    supabase.from('user_profiles').select('is_admin').eq('id', userId).maybeSingle()
      .then(({ data }) => setIsAdmin(data?.is_admin === true));
  }, [userId]);

  useEffect(() => {
    // Load unread count
    const loadUnreadCount = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('read', false);
      setUnreadCount(data?.length || 0);
    };
    loadUnreadCount();

    // Listen for new notifications
    const channel = supabase
      .channel('notifications-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.user_id === userId && !payload.new.read) {
          setUnreadCount(prev => prev + 1);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.user_id === userId) {
          if (payload.new.read && !payload.old.read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          } else if (!payload.new.read && payload.old.read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button
          onClick={() => setShowNotifications(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors relative"
          aria-label="Pranešimai"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Parametrai"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
        {isAdmin && (
          <button
            onClick={() => setShowAdmin(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Administracija"
          >
            <Shield className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onSignOut}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Atsijungti"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <SettingsModal
          userId={userId}
          onClose={() => setShowSettings(false)}
          onSignOut={onSignOut}
        />
      )}
      {showAdmin && <AdminLogs onClose={() => setShowAdmin(false)} />}
      {showNotifications && (
        <NotificationDrawer
          userId={userId}
          onClose={() => setShowNotifications(false)}
        />
      )}

      <div className="text-center mb-10 sm:mb-14">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-xl shadow-blue-500/40 mb-6 animate-pulse-slow">
          <Route className="w-12 h-12 text-white" strokeWidth={2.2} />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 mb-3">
          Priemiesčio Pavežėjimai
        </h1>
        <p className="mt-4 text-slate-600 max-w-md mx-auto text-base sm:text-lg font-medium">
          Pasidalinkite kelione su kaimynais. Sutaupykite laiką ir pinigus.
        </p>
      </div>

      <div className="w-full max-w-md flex flex-col gap-4 sm:gap-5">
        <button
          onClick={() => onPick('driver')}
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 p-7 sm:p-8 text-left shadow-xl shadow-blue-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/50 hover:-translate-y-1 active:translate-y-0 animate-gradient-x"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <div className="flex items-center gap-5 relative">
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/30 transition-transform duration-300 group-hover:scale-110">
              <Car className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Aš Vairuotojas</h2>
              <p className="text-blue-100 text-sm sm:text-base mt-0.5">Galiu pavežėti</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onPick('passenger')}
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-7 sm:p-8 text-left shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/50 hover:-translate-y-1 active:translate-y-0 animate-gradient-x"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <div className="flex items-center gap-5 relative">
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/30 transition-transform duration-300 group-hover:scale-110">
              <Users className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Aš Keleivis</h2>
              <p className="text-emerald-100 text-sm sm:text-base mt-0.5">Ieškau kelionės</p>
            </div>
          </div>
        </button>
      </div>

      <p className="mt-10 text-xs text-slate-400 text-center max-w-xs">
        Pasirinkite savo vaidmenį, kad pridėtumėte skelbimą ar matytumėte kitų pasiūlymus.
      </p>
    </div>
  );
}

function ListScreen({ role, userId, onBack, toast }: { role: TripRole; userId: string; onBack: () => void; toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void } }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [chatTrip, setChatTrip] = useState<Trip | null>(null);
  const [chatRequest, setChatRequest] = useState<RideRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [requestTarget, setRequestTarget] = useState<Trip | null>(null);
  const [offerTarget, setOfferTarget] = useState<Trip | null>(null);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [previewRequest, setPreviewRequest] = useState<RideRequest | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; name: string; trip: Trip } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'grid'>(() => {
    const saved = localStorage.getItem('viewMode');
    return (saved === 'list' || saved === 'map' || saved === 'grid') ? saved : 'list';
  });
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { position: userPos, status: gpsStatus } = useGeolocation();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  // Load unread notifications count
  useEffect(() => {
    const loadUnreadCount = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('read', false);
      setUnreadCount(data?.length || 0);
    };
    loadUnreadCount();

    const channel = supabase
      .channel('notifications-count-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.user_id === userId && !payload.new.read) {
          setUnreadCount(prev => prev + 1);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.user_id === userId) {
          if (payload.new.read && !payload.old.read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          } else if (!payload.new.read && payload.old.read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const clientId = userId;

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await withRetry(
        () => supabase
          .from('trips')
          .select('*')
          .is('deleted_at', null)
          .order('departure_time', { ascending: true }),
        { maxRetries: 2, delay: 1000, onRetry: (err, attempt) => console.log(`Retry ${attempt} for loadTrips:`, err.message) }
      );
      if (error) {
        setError('Nepavyko įkelti skelbimų. Bandykite vėliau.');
      } else {
        setTrips(data ?? []);
      }
    } catch (err) {
      setError('Nepavyko įkelti skelbimų. Bandykite vėliau.');
    }
    setLoading(false);
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await withRetry(
        () => supabase
          .from('ride_requests')
          .select('*')
          .order('created_at', { ascending: false }),
        { maxRetries: 2, delay: 1000, onRetry: (err, attempt) => console.log(`Retry ${attempt} for loadRequests:`, err.message) }
      );
      if (data) setAllRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  }, []);

  const loadProfiles = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', userIds);
    if (data) {
      setProfiles((prev) => {
        const next = new Map(prev);
        for (const p of data) next.set(p.id, p);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    loadTrips();
    loadRequests();

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void loadTrips(); void loadRequests(); }, 250);
    };
    const tripChannel = supabase
      .channel('trips-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(tripChannel);
    };
  }, [loadTrips, loadRequests]);

  useEffect(() => {
    const userIds = new Set<string>();
    for (const t of trips) {
      if (t.created_by) userIds.add(t.created_by);
    }
    for (const r of allRequests) {
      userIds.add(r.passenger_id);
    }
    loadProfiles([...userIds]);
  }, [trips, allRequests, loadProfiles]);

  const isDriver = role === 'driver';
  const ownLabel = isDriver ? 'Siūlau pavežėti' : 'Ieškau kelionės';
  const othersLabel = isDriver ? 'Keleivių skelbimai' : 'Vairuotojų pasiūlymai';
  const othersRole: TripRole = isDriver ? 'passenger' : 'driver';

  const visibleTrips = useMemo(
    () => trips.filter((t) => (t.status === 'active' && (t.created_by === clientId || new Date(t.departure_time).getTime() > now)) || t.created_by === clientId),
    [trips, clientId, now],
  );

  const ownTrips = visibleTrips.filter((t) => t.role === role && t.created_by === clientId);
  const otherTrips = visibleTrips.filter((t) => t.role === othersRole);
  const filteredOtherTrips = useMemo(
    () => applyFilters(otherTrips, filters).sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()),
    [otherTrips, filters],
  );

  const requestsByTrip = useMemo(() => {
    const map = new Map<string, RideRequest[]>();
    for (const r of allRequests) {
      const arr = map.get(r.trip_id) ?? [];
      arr.push(r);
      map.set(r.trip_id, arr);
    }
    return map;
  }, [allRequests]);

  const mySentRequests = allRequests.filter((r) => r.passenger_id === clientId && r.request_type === 'passenger_request' && r.status !== 'cancelled');
  const myReceivedOffers = allRequests.filter((r) => r.passenger_id === clientId && r.request_type === 'driver_offer');
  const mySentOffers = allRequests.filter((r) => r.driver_id === clientId && r.request_type === 'driver_offer');
  const mySentRequestTripIds = new Set(mySentRequests.map((r) => r.trip_id));

  const driverRequests = useMemo(() => {
    const ownTripIds = new Set(ownTrips.filter((t) => t.role === 'driver').map((t) => t.id));
    return allRequests.filter((r) => r.request_type === 'passenger_request' && ownTripIds.has(r.trip_id));
  }, [allRequests, ownTrips]);


  const pendingDriverRequests = driverRequests.filter((r) => r.status === 'pending');
  const pendingPassengerOffers = myReceivedOffers.filter((r) => r.status === 'pending');
  const acceptedDriverRequests = driverRequests.filter((r) => r.status === 'accepted');
  const rejectedDriverRequests = driverRequests.filter((r) => r.status === 'rejected');

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const result: MapMarker[] = [];
    for (const t of filteredOtherTrips) {
      if (t.from_lat !== null && t.from_lng !== null) {
        result.push({ trip: t, lat: t.from_lat, lng: t.from_lng, label: `Iš: ${t.from_location}`, isFrom: true });
      }
      if (t.to_lat !== null && t.to_lng !== null) {
        result.push({ trip: t, lat: t.to_lat, lng: t.to_lng, label: `Į: ${t.to_location}`, isFrom: false });
      }
    }
    return result;
  }, [filteredOtherTrips]);

  async function updateRequestStatus(
    requestId: string,
    status: RequestStatus,
    driverMessage?: string,
  ) {
    setActionLoading(requestId);
    
    // Optimistic update
    setAllRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, status, driver_message: driverMessage ?? r.driver_message } : r
    ));
    
    const { error } = await supabase.rpc('set_ride_request_status', {
      p_request_id: requestId,
      p_status: status,
      p_driver_message: driverMessage ?? null,
    });
    setActionLoading(null);
    if (error) {
      // Revert optimistic update on error
      loadRequests();
      const message = error.message.includes('not enough seats')
        ? 'Šiai kelionei nepakanka laisvų vietų.'
        : 'Nepavyko atnaujinti užklausos. Bandykite dar kartą.';
      setError(message);
      toast.error(message);
      setTimeout(() => setError(null), 3000);
    } else {
      loadRequests();
      if (status === 'accepted') toast.success('Užklausa patvirtinta!');
      else if (status === 'rejected') toast.info('Užklausa atmesta');
      else if (status === 'cancelled') toast.info('Užklausa atšaukta');
    }
  }

  function findTripById(id: string): Trip | undefined {
    return trips.find((t) => t.id === id);
  }

  function openChat(trip: Trip, request?: RideRequest | null) {
    setChatTrip(trip);
    setChatRequest(request ?? null);
  }

  function getUserRating(userId: string): { avg: number; total: number } | null {
    const p = profiles.get(userId);
    if (!p || p.total_ratings === 0) return null;
    return { avg: Number(p.avg_rating), total: p.total_ratings };
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Atgal"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {isDriver ? 'Aš Vairuotojas' : 'Aš Keleivis'}
            </h1>
            <p className="text-sm text-slate-500 truncate">{ownLabel} · {isDriver ? 'Siūlykite savo kelionę keleiviui' : 'Rinkitės vairuotoją arba laukite pasiūlymų'}</p>
          </div>
          {((isDriver ? pendingDriverRequests.length : pendingPassengerOffers.length) > 0) && (
            <div className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              <Bell className="w-3.5 h-3.5" />
              {isDriver ? pendingDriverRequests.length : pendingPassengerOffers.length}
            </div>
          )}
          <button
            onClick={() => setShowNotifications(true)}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors relative"
            aria-label="Pranešimai"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-600/25 hover:bg-blue-700 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Pridėti skelbimą</span>
            <span className="sm:hidden">Pridėti</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Parametrai"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-4">
        <div className="inline-flex rounded-full bg-slate-100 p-1 gap-1">
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              viewMode === 'list' || viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {viewMode === 'list' ? <Grid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            {viewMode === 'list' ? 'Kortelės' : 'Sąrašas'}
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              viewMode === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            Žemėlapis
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 mt-6">
        {showForm && (
          <TripForm
            role={role}
            userId={userId}
            onClose={() => setShowForm(false)}
            onSubmitted={() => {
              setShowForm(false);
              loadTrips();
              toast.success('Skelbimas sukurtas!');
            }}
          />
        )}

        {editTrip && (
          <TripForm
            role={editTrip.role}
            userId={userId}
            editTrip={editTrip}
            onClose={() => setEditTrip(null)}
            onSubmitted={() => {
              setEditTrip(null);
              loadTrips();
              toast.success('Skelbimas atnaujintas!');
            }}
          />
        )}

        {chatTrip && (
          <ChatDrawer
            trip={chatTrip}
            request={chatRequest}
            userId={userId}
            onClose={() => {
              setChatTrip(null);
              setChatRequest(null);
            }}
            onBothConfirmed={() => {
              loadTrips();
              loadRequests();
            }}
          />
        )}

        {offerTarget && (
          <OfferModal
            passengerTrip={offerTarget}
            driverTrips={ownTrips.filter((t) => t.role === 'driver')}
            userId={userId}
            onClose={() => setOfferTarget(null)}
            onSubmitted={() => { setOfferTarget(null); loadRequests(); toast.success('Pasiūlymas išsiųstas!'); }}
          />
        )}

        {requestTarget && (
          <RequestModal
            trip={requestTarget}
            userId={userId}
            onClose={() => setRequestTarget(null)}
            onSubmitted={() => {
              setRequestTarget(null);
              loadRequests();
              toast.success('Užklausa išsiųsta!');
            }}
          />
        )}

        {previewTrip && (
          <RoutePreviewModal
            trip={previewTrip}
            request={previewRequest}
            onClose={() => {
              setPreviewTrip(null);
              setPreviewRequest(null);
            }}
          />
        )}

        {profileTarget && (
          <UserProfileModal
            userId={profileTarget.userId}
            displayName={profileTarget.name}
            tripContext={profileTarget.trip}
            canRate={profileTarget.userId !== clientId && profileTarget.trip.status === 'completed'}
            onRate={async (score, comment) => {
              const ratedId = profileTarget.userId;
              const rateRole: TripRole = profileTarget.trip.role === 'driver' ? 'driver' : 'passenger';
              const { error: ratingError } = await supabase.rpc('submit_rating', {
                p_trip_id: profileTarget.trip.id,
                p_rated_id: ratedId,
                p_role: rateRole,
                p_score: score,
                p_comment: comment ?? null,
              });
              if (ratingError) {
                throw new Error(ratingError.message.includes('already submitted') ? 'Šią kelionę jau įvertinote.' : 'Nepavyko pateikti vertinimo.');
              }
              loadProfiles([ratedId]);
            }}
            onClose={() => setProfileTarget(null)}
          />
        )}

        {showSettings && (
          <SettingsModal
            userId={userId}
            onClose={() => setShowSettings(false)}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
        {showNotifications && (
          <NotificationDrawer
            userId={userId}
            onClose={() => setShowNotifications(false)}
          />
        )}

        {deleteTarget && (
          <DeleteReasonModal
            role={deleteTarget.role}
            onClose={() => setDeleteTarget(null)}
            onConfirm={async (reason) => {
              const { error } = await supabase
                .from('trips')
                .update({ deleted_at: new Date().toISOString(), deletion_reason: reason })
                .eq('id', deleteTarget.id);
              if (error) throw new Error('Failed to delete');
              setDeleteTarget(null);
              loadTrips();
            }}
          />
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Įkeliama…</p>
          </div>
        ) : viewMode === 'map' ? (
          <div className="flex flex-col gap-4">
            <MapView
              markers={mapMarkers}
              userPos={userPos}
              onTripClick={(t) => { setPreviewTrip(t); setPreviewRequest(null); }}
            />
            {gpsStatus === 'denied' && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-700 text-sm flex items-start gap-2">
                <MapIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Nepavyko nustatyti jūsų vietos. Leiskite prieigą prie vietos naršyklės nustatymuose, kad matytumėte savo poziciją žemėlapyje.
                </span>
              </div>
            )}
            {gpsStatus === 'loading' && (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Nustatoma jūsų vieta…
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Driver: incoming requests */}
            {isDriver && driverRequests.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Inbox className="w-4 h-4" />
                  Gautos užklausos ({driverRequests.length})
                </h2>

                {pendingDriverRequests.length > 0 && (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4 mb-4' : 'flex flex-col gap-3 mb-4'}>
                    {pendingDriverRequests.map((r) => {
                      const t = findTripById(r.trip_id);
                      if (!t) return null;
                      return (
                        <RequestCard
                          key={r.id}
                          request={r}
                          trip={t}
                          isDriverView
                          onAccept={() => updateRequestStatus(r.id, 'accepted')}
                          onReject={() => updateRequestStatus(r.id, 'rejected')}
                          onPreviewRoute={() => {
                            setPreviewTrip(t);
                            setPreviewRequest(r);
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {acceptedDriverRequests.length > 0 && (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4 mb-4' : 'flex flex-col gap-3 mb-4'}>
                    <p className={viewMode === 'grid' ? 'col-span-full text-xs font-semibold text-emerald-600 uppercase tracking-wide' : 'text-xs font-semibold text-emerald-600 uppercase tracking-wide'}>Patvirtintos</p>
                    {acceptedDriverRequests.map((r) => {
                      const t = findTripById(r.trip_id);
                      if (!t) return null;
                      return (
                        <RequestCard
                          key={r.id}
                          request={r}
                          trip={t}
                          isDriverView
                          onChat={() => openChat(t, r)}
                          onPreviewRoute={() => {
                            setPreviewTrip(t);
                            setPreviewRequest(r);
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {rejectedDriverRequests.length > 0 && (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                    <p className={viewMode === 'grid' ? 'col-span-full text-xs font-semibold text-red-500 uppercase tracking-wide' : 'text-xs font-semibold text-red-500 uppercase tracking-wide'}>Atmestos</p>
                    {rejectedDriverRequests.map((r) => {
                      const t = findTripById(r.trip_id);
                      if (!t) return null;
                      return <RequestCard key={r.id} request={r} trip={t} isDriverView />;
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Driver: offers sent to passengers */}
            {isDriver && mySentOffers.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Mano pasiūlymai keleiviams ({mySentOffers.length})</h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {mySentOffers.map((r) => { const t = findTripById(r.trip_id); if (!t) return null; return <RequestCard key={r.id} request={r} trip={t} isDriverView={true} isOffer onCancel={() => updateRequestStatus(r.id, 'cancelled')} onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined} />; })}
                </div>
              </section>
            )}

            {/* Passenger: incoming driver offers */}
            {!isDriver && myReceivedOffers.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4" /> Vairuotojų pasiūlymai ({myReceivedOffers.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {myReceivedOffers.map((r) => {
                    const t = findTripById(r.trip_id);
                    if (!t) return null;
                    return <RequestCard key={r.id} request={r} trip={t} isDriverView={false} isOffer
                      onAccept={() => updateRequestStatus(r.id, 'accepted')}
                      onReject={() => updateRequestStatus(r.id, 'rejected')}
                      onCancel={() => updateRequestStatus(r.id, 'cancelled')}
                      onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined}
                      onPreviewRoute={() => { setPreviewTrip(t); setPreviewRequest(r); }} />;
                  })}
                </div>
              </section>
            )}

            {/* Passenger: my sent requests */}
            {!isDriver && mySentRequests.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Mano užklausos ({mySentRequests.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {mySentRequests.map((r) => {
                    const t = findTripById(r.trip_id);
                    if (!t) return null;
                    return (
                      <RequestCard
                        key={r.id}
                        request={r}
                        trip={t}
                        isDriverView={false}
                        onCancel={() => updateRequestStatus(r.id, 'cancelled')}
                        onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined}
                        onPreviewRoute={() => {
                          setPreviewTrip(t);
                          setPreviewRequest(r);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Own trips */}
            {ownTrips.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Mano skelbimai ({ownTrips.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {ownTrips.map((t) => {
                    const tripRequests = requestsByTrip.get(t.id) ?? [];
                    const pendingCount = tripRequests.filter((r) => r.status === 'pending').length;
                    return (
                      <TripCard
                        key={t.id}
                        trip={t}
                        highlight
                        pendingCount={pendingCount}
                        onEdit={() => setEditTrip(t)}
                        onDeleteRequest={() => setDeleteTarget(t)}
                        onPreviewRoute={() => {
                          setPreviewTrip(t);
                          setPreviewRequest(null);
                        }}
                        onShowProfile={() =>
                          setProfileTarget({ userId: t.created_by ?? '', name: t.name, trip: t })
                        }
                        userRating={t.created_by ? getUserRating(t.created_by) : null}
                        showPrivateDetails
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Other trips with filters */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {othersLabel} ({filteredOtherTrips.length})
              </h2>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                resultCount={filteredOtherTrips.length}
              />
              {filteredOtherTrips.length === 0 ? (
                <div className="rounded-2xl bg-white border border-dashed border-slate-300 p-10 text-center">
                  <p className="text-slate-500 text-sm">
                    {otherTrips.length === 0
                      ? 'Kol kas nėra skelbimų. Būkite pirmas, kuris pridės!'
                      : 'Pagal nurodytus kriterijus skelbimų nerasta. Pakeiskite filtravimą.'}
                  </p>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {filteredOtherTrips.map((t) => {
                    const alreadyRequested = mySentRequestTripIds.has(t.id);
                    const myRequest = mySentRequests.find((r) => r.trip_id === t.id);
                    return (
                      <TripCard
                        key={t.id}
                        trip={t}
                        onSelect={isDriver ? () => setOfferTarget(t) : () => setRequestTarget(t)}
                        highlight={alreadyRequested}
                        onPreviewRoute={() => {
                          setPreviewTrip(t);
                          setPreviewRequest(myRequest ?? null);
                        }}
                        onShowProfile={() =>
                          setProfileTarget({ userId: t.created_by ?? '', name: t.name, trip: t })
                        }
                        userRating={t.created_by ? getUserRating(t.created_by) : null}
                        selectLabel={isDriver ? 'Siūlyti pavežėjimą' : 'Siųsti užklausą'}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
