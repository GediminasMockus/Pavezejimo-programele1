import { useUnreadCount } from '@/lib/useUnreadCount';
import { useRoadMatches } from '@/lib/useRoadMatches';
import { useCorridorMatches, type CorridorSearchRoute } from '@/lib/useCorridorMatches';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { withRetry } from '@/lib/retry';
import {
  Car,
  ArrowLeft,
  Plus,
  Loader2,
  List,
  Grid,
  Bell,
  Inbox,
  Sparkles,
  Route,
  Settings as SettingsIcon,
  Users,
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
import { useGeolocation } from '@/lib/useGeolocation';
import { RequestModal } from '@/components/RequestModal';
import { RequestCard } from '@/components/RequestCard';
import { OfferModal } from '@/components/OfferModal';
import { FilterBar } from '@/components/FilterBar';
import { applyFilters, isDiscoverableTrip, emptyFilters, findBestMatches, type FilterState } from '@/lib/tripFilters';
import { fetchAllRows } from '@/lib/pagination';
import { navigationUrl } from '@/lib/navigation';
import { RoutePreviewModal } from '@/components/RoutePreviewModal';
import { UserProfileModal } from '@/components/UserProfileModal';
import { HomeScreen } from '@/components/HomeScreen';
import { AuthScreen } from '@/components/AuthScreen';
import { Background } from '@/components/Background';
import { SettingsModal } from '@/components/SettingsModal';
import { NotificationDrawer } from '@/components/NotificationDrawer';

type Screen = 'home' | 'list';
type AppHistoryState = {
  screen: Screen;
  role?: TripRole;
  filters?: FilterState;
  create?: boolean;
  focusTripId?: string | null;
  chatRequestId?: string | null;
};

const APP_HISTORY_KEY = 'pavezejimaiNavigation';

function readAppHistoryState(state: unknown = window.history.state): AppHistoryState | null {
  if (!state || typeof state !== 'object') return null;
  const navigation = (state as Record<string, unknown>)[APP_HISTORY_KEY];
  if (!navigation || typeof navigation !== 'object') return null;
  const value = navigation as Partial<AppHistoryState>;
  if (value.screen === 'home') return { screen: 'home' };
  if (value.screen === 'list' && (value.role === 'driver' || value.role === 'passenger')) {
    return {
      screen: 'list',
      role: value.role,
      filters: value.filters ?? emptyFilters,
      create: value.create === true,
      focusTripId: typeof value.focusTripId === 'string' ? value.focusTripId : null,
      chatRequestId: typeof value.chatRequestId === 'string' ? value.chatRequestId : null,
    };
  }
  return null;
}

function browserStateWith(navigation: AppHistoryState) {
  const current = window.history.state;
  const base = current && typeof current === 'object' ? current : {};
  return { ...base, [APP_HISTORY_KEY]: navigation };
}

function isCurrentRequest(request: RideRequest) {
  return request.status === 'pending' || request.status === 'accepted';
}

export default function App() {
  const initialNavigation = useMemo(() => readAppHistoryState(), []);
  const [search, setSearch] = useState<FilterState>(initialNavigation?.filters ?? emptyFilters);
  const [startForm, setStartForm] = useState(initialNavigation?.create ?? false);
  const [screen, setScreen] = useState<Screen>(initialNavigation?.screen ?? 'home');
  const [activeRole, setActiveRole] = useState<TripRole | null>(initialNavigation?.role ?? null);
  const [focusTripId, setFocusTripId] = useState<string | null>(initialNavigation?.focusTripId ?? null);
  const [chatRequestId, setChatRequestId] = useState<string | null>(initialNavigation?.chatRequestId ?? null);
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

  useEffect(() => {
    if (!readAppHistoryState()) {
      window.history.replaceState(browserStateWith({ screen: 'home' }), '');
    }

    const handlePopState = (event: PopStateEvent) => {
      const navigation = readAppHistoryState(event.state);
      if (navigation?.screen === 'list' && navigation.role) {
        setSearch(navigation.filters ?? emptyFilters);
        setStartForm(navigation.create ?? false);
        setFocusTripId(navigation.focusTripId ?? null);
        setChatRequestId(navigation.chatRequestId ?? null);
        setActiveRole(navigation.role);
        setScreen('list');
        return;
      }
      setSearch(emptyFilters);
      setStartForm(false);
      setFocusTripId(null);
      setChatRequestId(null);
      setActiveRole(null);
      setScreen('home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  const showList = (role: TripRole, filters: FilterState, create: boolean, tripId: string | null, requestId: string | null = null) => {
    const navigation: AppHistoryState = { screen: 'list', role, filters, create, focusTripId: tripId, chatRequestId: requestId };
    window.history.pushState(browserStateWith(navigation), '');
    setSearch(filters);
    setStartForm(create);
    setFocusTripId(tripId);
    setChatRequestId(requestId);
    setActiveRole(role);
    setScreen('list');
  };

  const openMatchedTrip = (tripId: string, matchedTripRole: TripRole) => {
    showList(matchedTripRole === 'driver' ? 'passenger' : 'driver', emptyFilters, false, tripId);
  };

  const openRole = (role: TripRole) => {
    showList(role, emptyFilters, false, null);
  };

  const openNotificationChat = async (requestId: string) => {
    const { data: request, error: requestError } = await supabase
      .from('ride_requests')
      .select('id, passenger_id, driver_id, request_type')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError || !request) {
      error('Nepavyko atidaryti šio pokalbio. Atnaujinkite puslapį ir bandykite dar kartą.');
      return;
    }

    const targetRole: TripRole = request.passenger_id === userId ? 'passenger' : 'driver';
    showList(targetRole, emptyFilters, false, null, requestId);
  };

  return (
    <div className="min-h-screen text-slate-800">
      <Background />
      <ToastContainer toasts={toasts} onRemove={remove} />
      {screen === 'home' && (
        <HomeScreen
          userId={userId}
          onPick={(role, searchFilters, create = false) => {
            showList(role, searchFilters ?? emptyFilters, create, null);
          }}
          onOpenMatchedTrip={openMatchedTrip}
          onOpenChat={openNotificationChat}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {screen === 'list' && activeRole && (
        <ListScreen
          key={`${userId}:${activeRole}:${focusTripId ?? ''}:${chatRequestId ?? ''}`}
          role={activeRole}
          initialFilters={search}
          initialForm={startForm}
          focusTripId={focusTripId}
          initialChatRequestId={chatRequestId}
          userId={userId}
          onOpenMatchedTrip={openMatchedTrip}
          onOpenRole={openRole}
          onOpenNotificationChat={openNotificationChat}
          onBack={() => {
            if (readAppHistoryState()?.screen === 'list' && window.history.length > 1) {
              window.history.back();
            } else {
              window.history.replaceState(browserStateWith({ screen: 'home' }), '');
              setScreen('home');
              setActiveRole(null);
            }
          }}
          toast={{ success, error, info, warning }}
        />
      )}
    </div>
  );
}

function ListScreen({ role, userId, onBack, toast, initialFilters, initialForm, focusTripId, initialChatRequestId, onOpenMatchedTrip, onOpenRole, onOpenNotificationChat }: { initialFilters: FilterState; initialForm: boolean; focusTripId: string | null; initialChatRequestId: string | null; role: TripRole; userId: string; onBack: () => void; onOpenMatchedTrip: (tripId: string, matchedTripRole: TripRole) => void; onOpenRole: (role: TripRole) => void; onOpenNotificationChat: (requestId: string) => void; toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void } }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [publicTripIds, setPublicTripIds] = useState<Set<string>>(new Set());
  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(initialForm);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [chatTrip, setChatTrip] = useState<Trip | null>(null);
  const [chatRequest, setChatRequest] = useState<RideRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = useUnreadCount(userId);
  const [requestTarget, setRequestTarget] = useState<Trip | null>(null);
  const [requestPassengerTrip, setRequestPassengerTrip] = useState<Trip | null>(null);
  const [requestInitialRoute, setRequestInitialRoute] = useState<CorridorSearchRoute | null>(null);
  const [offerTarget, setOfferTarget] = useState<Trip | null>(null);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [previewRequest, setPreviewRequest] = useState<RideRequest | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; name: string; trip: Trip } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    const saved = localStorage.getItem('viewMode');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const loadVersion = useRef(0);
  const openedNotificationChat = useRef<string | null>(null);
  const loadedOnce = useRef(false);
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const hasScrolledToInitialResults = useRef(false);
  const [publicLimit, setPublicLimit] = useState(100);
  const [hasMoreTrips, setHasMoreTrips] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() => {
    if (focusTripId) return emptyFilters;
    if (initialFilters.fromLocation || initialFilters.toLocation || initialFilters.date) return initialFilters;
    try {
      const saved = localStorage.getItem('pavezejimai_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure radiusKm exists for backwards compatibility
        return { ...emptyFilters, ...parsed, radiusKm: parsed.radiusKm ?? 0 };
      }
    } catch {
      // Ignore localStorage errors
    }
    return emptyFilters;
  });
  useEffect(() => { setPublicLimit(100); }, [filters]);
  const [, setActionLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { position: userPos } = useGeolocation();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('pavezejimai_filters', JSON.stringify(filters));
    } catch {
      // Ignore localStorage errors
    }
  }, [filters]);

  // Load unread notifications count


  const clientId = userId;

  const loadTrips = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const [publicResult, privateTrips, requestRelatedTrips] = await Promise.all([
        withRetry(
          () => {
            const dateFrom = filters.date ? new Date(filters.date + 'T00:00:00') : null;
            const dateTo = dateFrom ? new Date(dateFrom) : null;
            dateTo?.setDate(dateTo.getDate() + 1);
            const price = filters.maxPrice.replace(',', '.');
            return supabase.rpc('search_trips', { p_role: role === 'driver' ? 'passenger' : 'driver',
              p_filters: { ...filters, maxPrice: price && Number.isFinite(Number(price)) ? price : null, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
              p_lat: userPos?.lat ?? null, p_lng: userPos?.lng ?? null })
            .order('departure_time', { ascending: true }).order('id')
            .range(0, publicLimit);
          },
          { maxRetries: 2, delay: 1000, onRetry: (err, attempt) => console.log(`Retry ${attempt} for public trips:`, err.message) }
        ),
        fetchAllRows<Trip>((from, to) => supabase.rpc('get_accessible_trips').order('id').range(from, to)),
        fetchAllRows<Trip>((from, to) => supabase.rpc('get_request_related_trips').order('id').range(from, to)),
      ]);
      if (version !== loadVersion.current) return;
      if (publicResult.error) {
        setPublicTripIds(new Set());
        setError('Nepavyko įkelti skelbimų. Bandykite vėliau.');
      } else {
        const merged = new Map<string, Trip>();
        const publicTrips = (publicResult.data ?? []).slice(0, publicLimit) as Trip[];
        setHasMoreTrips((publicResult.data?.length ?? 0) > publicLimit);
        setPublicTripIds(new Set(publicTrips.map((trip) => trip.id)));
        for (const trip of requestRelatedTrips) merged.set(trip.id, trip);
        for (const trip of publicTrips) merged.set(trip.id, trip);
        for (const trip of privateTrips) merged.set(trip.id, { ...merged.get(trip.id), ...trip });
        setTrips([...merged.values()].sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()));
      }
    } catch {
      setError('Nepavyko įkelti skelbimų. Bandykite vėliau.');
    }
    if (version === loadVersion.current) { loadedOnce.current = true; setLoading(false); }
  }, [role, publicLimit, filters, userPos]);

  const loadRequests = useCallback(async () => {
    try {
      const data = await fetchAllRows<RideRequest>((from, to) => withRetry(() => supabase.from('ride_requests').select('*').order('created_at', { ascending: false }).order('id').range(from, to)));
      setAllRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
      setError('Nepavyko įkelti užklausų. Bandykite dar kartą.');
    }
  }, []);

  const loadProfiles = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('id,display_name,total_ratings,avg_rating,default_role,created_at')
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
    const initial = window.setTimeout(() => { void loadTrips(); void loadRequests(); }, 250);
    const refresh = window.setInterval(() => { void loadTrips(); }, 30_000);

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
      window.clearTimeout(initial);
      window.clearInterval(refresh);
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
  const othersLabel = isDriver ? 'Keleivių skelbimai' : 'Vairuotojų pasiūlymai';
  const othersRole: TripRole = isDriver ? 'passenger' : 'driver';

  const visibleTrips = useMemo(
    () => trips.filter((t) => isDiscoverableTrip(t, now) || t.created_by === clientId),
    [trips, clientId, now],
  );

  const ownTrips = useMemo(() => visibleTrips.filter((t) => t.role === role && t.created_by === clientId).map(t => ({ ...t, available_seats: t.seats - allRequests.filter(r => (r.driver_trip_id ?? r.trip_id) === t.id && r.status === "accepted").reduce((sum, r) => sum + r.seats_needed, 0) })), [visibleTrips, role, clientId, allRequests]);
  const otherTrips = useMemo(() => visibleTrips.filter((t) => publicTripIds.has(t.id) && t.role === othersRole && t.created_by !== clientId && isDiscoverableTrip(t, now)), [visibleTrips, publicTripIds, othersRole, clientId, now]);
  const filteredOtherTrips = useMemo(
    () => applyFilters(otherTrips, { ...filters, fromLocation: '', toLocation: '' }, userPos?.lat, userPos?.lng).sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()),
    [otherTrips, filters, userPos],
  );
  const hasActiveFilters = Boolean(
    filters.fromLocation.trim()
    || filters.toLocation.trim()
    || filters.date
    || filters.minSeats > 0
    || filters.maxPrice.trim()
    || filters.recurringOnly
    || filters.radiusKm > 0,
  );
  const hasRouteSearch = Boolean(filters.fromLocation.trim() || filters.toLocation.trim());
  const { matches: rawCorridorMatches, loading: corridorLoading, error: corridorError } = useCorridorMatches(role, filters);
  const corridorMatches = useMemo(
    () => rawCorridorMatches.filter(match =>
      !publicTripIds.has(match.trip.id)
      && applyFilters([match.trip], { ...filters, fromLocation: '', toLocation: '', date: '' }, userPos?.lat, userPos?.lng).length > 0,
    ),
    [rawCorridorMatches, publicTripIds, filters, userPos],
  );
  const totalSearchResults = filteredOtherTrips.length + corridorMatches.length;
  const hasSearchResults = totalSearchResults > 0;

  useEffect(() => {
    const hasInitialRouteSearch = Boolean(initialFilters.fromLocation.trim() || initialFilters.toLocation.trim());
    if (
      loading
      || focusTripId
      || !hasInitialRouteSearch
      || hasScrolledToInitialResults.current
    ) return;

    hasScrolledToInitialResults.current = true;
    const frame = window.requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, focusTripId, initialFilters.fromLocation, initialFilters.toLocation, filteredOtherTrips.length]);

  const nextOwnTrip = useMemo(() => ownTrips.filter(t => t.status === 'active' && new Date(t.departure_time).getTime() >= now).sort((a,b) => new Date(a.departure_time).getTime()-new Date(b.departure_time).getTime())[0], [ownTrips, now]);
  const preliminaryMatches = useMemo(() => nextOwnTrip ? findBestMatches({ ...nextOwnTrip, seats: nextOwnTrip.available_seats }, otherTrips, 3) : [], [nextOwnTrip, otherTrips]);
  const bestMatches = useRoadMatches(nextOwnTrip, preliminaryMatches);

  useEffect(() => {
    if (!focusTripId || loading) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`trip-${focusTripId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTripId, loading, filteredOtherTrips.length]);

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
  const myReceivedOffers = allRequests.filter((r) => r.passenger_id === clientId && r.request_type === 'driver_offer' && r.status !== 'cancelled');
  const mySentOffers = allRequests.filter((r) => r.driver_id === clientId && r.request_type === 'driver_offer' && r.status !== 'cancelled');
  const mySentRequestTripIds = new Set(mySentRequests.map((r) => r.trip_id));
  const loadedTripIds = new Set(trips.map((trip) => trip.id));
  const displayableMySentRequests = mySentRequests.filter((r) => isCurrentRequest(r) && loadedTripIds.has(r.driver_trip_id ?? r.trip_id));
  const displayableMyReceivedOffers = myReceivedOffers.filter((r) => isCurrentRequest(r) && loadedTripIds.has(r.driver_trip_id ?? r.trip_id));
  const displayableMySentOffers = mySentOffers.filter((r) => isCurrentRequest(r) && loadedTripIds.has(r.driver_trip_id ?? r.trip_id));

  const driverRequests = useMemo(() => {
    const ownTripIds = new Set(ownTrips.filter((t) => t.role === 'driver').map((t) => t.id));
    return allRequests.filter((r) => r.request_type === 'passenger_request' && r.status !== 'cancelled' && ownTripIds.has(r.trip_id));
  }, [allRequests, ownTrips]);


  const pendingDriverRequests = driverRequests.filter((r) => r.status === 'pending');
  const acceptedDriverRequests = driverRequests.filter((r) => r.status === 'accepted');

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

  const refreshAfterCompletion = useCallback(() => {
    void loadTrips();
    void loadRequests();
  }, [loadTrips, loadRequests]);

  function findTripById(id: string): Trip | undefined {
    return trips.find((t) => t.id === id);
  }

  function openChat(trip: Trip, request?: RideRequest | null) {
    setChatTrip(trip);
    setChatRequest(request ?? null);
  }

  useEffect(() => {
    if (!initialChatRequestId || loading || openedNotificationChat.current === initialChatRequestId) return;
    const request = allRequests.find((item) => item.id === initialChatRequestId);
    if (!request) return;
    const trip = trips.find((item) => item.id === (request.driver_trip_id ?? request.trip_id));
    if (!trip) return;
    openedNotificationChat.current = initialChatRequestId;
    setChatTrip(trip);
    setChatRequest(request);
  }, [initialChatRequestId, loading, allRequests, trips]);

  function openGoogleMapsNavigation(trip: Trip, request?: RideRequest | null) {
    window.open(navigationUrl(trip, request), '_blank', 'noopener,noreferrer');
  }

  function getUserRating(userId: string): { avg: number; total: number } | null {
    const p = profiles.get(userId);
    if (!p || p.total_ratings === 0) return null;
    return { avg: Number(p.avg_rating), total: p.total_ratings };
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Atgal"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Programėlės režimas">
            <button
              type="button"
              aria-pressed={!isDriver}
              onClick={() => isDriver && onOpenRole('passenger')}
              className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition sm:text-sm ${!isDriver ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="mr-1 inline h-3.5 w-3.5" />
              Keleivis
            </button>
            <button
              type="button"
              aria-pressed={isDriver}
              onClick={() => !isDriver && onOpenRole('driver')}
              className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition sm:text-sm ${isDriver ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Car className="mr-1 inline h-3.5 w-3.5" />
              Vairuotojas
            </button>
          </div>
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
            className="flex-shrink-0 inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-600/25 transition-all hover:bg-blue-700 active:scale-95 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
            aria-label="Pridėti skelbimą"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Pridėti skelbimą</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="hidden flex-shrink-0 w-10 h-10 rounded-full sm:flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Parametrai"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="hidden sm:block max-w-2xl mx-auto px-4 sm:px-6 mt-4">
        <div className="inline-flex rounded-full bg-slate-100 p-1 gap-1" aria-label="Skelbimų išdėstymas">
          <button
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
            Sąrašas
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid className="w-4 h-4" />
            Tinklelis
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 mt-6">
        {showForm && (
          <TripForm
            role={role}
            initialSearch={filters}
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
            onBothConfirmed={refreshAfterCompletion}
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
            passengerTrip={requestPassengerTrip}
            initialRoute={requestInitialRoute}
            userId={userId}
            onClose={() => {
              setRequestTarget(null);
              setRequestPassengerTrip(null);
              setRequestInitialRoute(null);
            }}
            onSubmitted={() => {
              setRequestTarget(null);
              setRequestPassengerTrip(null);
              setRequestInitialRoute(null);
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
              const ratingRequest = allRequests.find((r) =>
                r.status === 'accepted' &&
                ((r.trip_id === profileTarget.trip.id && (r.passenger_id === ratedId || r.passenger_id === clientId)) ||
                 (r.driver_trip_id === profileTarget.trip.id && (r.driver_id === ratedId || r.driver_id === clientId)))
              );
              const { error: ratingError } = await supabase.rpc('submit_rating', {
                p_trip_id: profileTarget.trip.id,
                p_rated_id: ratedId,
                p_role: rateRole,
                p_score: score,
                p_comment: comment ?? null,
                p_request_id: ratingRequest?.id ?? null,
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
            onOpenMatch={(tripId, matchedTripRole) => {
              setShowNotifications(false);
              onOpenMatchedTrip(tripId, matchedTripRole);
            }}
            onOpenRole={(targetRole) => {
              setShowNotifications(false);
              onOpenRole(targetRole);
            }}
            onOpenChat={(requestId) => {
              setShowNotifications(false);
              const request = allRequests.find((item) => item.id === requestId);
              const trip = request ? findTripById(request.driver_trip_id ?? request.trip_id) : undefined;
              if (request && trip) openChat(trip, request);
              else void onOpenNotificationChat(requestId);
            }}
          />
        )}

        {deleteTarget && (
          <DeleteReasonModal
            role={deleteTarget.role}
            onClose={() => setDeleteTarget(null)}
            onConfirm={async (reason) => {
              const { error } = await supabase
                .rpc('delete_my_trip', { p_trip_id: deleteTarget.id, p_reason: reason });
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
        ) : (
          <>
            {/* Driver: incoming requests */}
            {isDriver && (pendingDriverRequests.length > 0 || acceptedDriverRequests.length > 0) && (
              <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-amber-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Inbox className="h-4 w-4" /></span>
                  {pendingDriverRequests.length > 0 ? 'Reikia jūsų veiksmo' : 'Patvirtintos kelionės'} ({pendingDriverRequests.length + acceptedDriverRequests.length})
                </h2>

                {pendingDriverRequests.length > 0 && (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4' : 'flex flex-col gap-3 mb-4'}>
                    {pendingDriverRequests.map((r) => {
                      const t = findTripById(r.driver_trip_id ?? r.trip_id);
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
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4' : 'flex flex-col gap-3 mb-4'}>
                    <p className={viewMode === 'grid' ? 'col-span-full text-xs font-semibold text-emerald-600 uppercase tracking-wide' : 'text-xs font-semibold text-emerald-600 uppercase tracking-wide'}>Patvirtintos</p>
                    {acceptedDriverRequests.map((r) => {
                      const t = findTripById(r.driver_trip_id ?? r.trip_id);
                      if (!t) return null;
                      return (
                        <RequestCard
                          key={r.id}
                          request={r}
                          trip={t}
                          isDriverView
                          onCancel={() => updateRequestStatus(r.id, "cancelled")}
                          onChat={() => openChat(t, r)}
                          onNavigation={() => openGoogleMapsNavigation(t, r)}
                          onPreviewRoute={() => {
                            setPreviewTrip(t);
                            setPreviewRequest(r);
                          }}
                        />
                      );
                    })}
                  </div>
                )}

              </section>
            )}

            {/* Driver: offers sent to passengers */}
            {isDriver && displayableMySentOffers.length > 0 && (
              <section className="mb-6 rounded-3xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-sky-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Car className="h-4 w-4" /></span>
                  Mano aktyvūs pasiūlymai ({displayableMySentOffers.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {displayableMySentOffers.map((r) => { const t = findTripById(r.driver_trip_id ?? r.trip_id)!; return <RequestCard key={r.id} request={r} trip={t} isDriverView={true} isOffer onCancel={() => updateRequestStatus(r.id, 'cancelled')} onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined} onNavigation={r.status === 'accepted' ? () => openGoogleMapsNavigation(t, r) : undefined} />; })}
                </div>
              </section>
            )}

            {/* Passenger: incoming driver offers */}
            {!isDriver && displayableMyReceivedOffers.length > 0 && (
              <section className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-emerald-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Car className="h-4 w-4" /></span>
                  Nauji pasiūlymai ir kelionės ({displayableMyReceivedOffers.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {displayableMyReceivedOffers.map((r) => {
                    const t = findTripById(r.driver_trip_id ?? r.trip_id)!;
                    return <RequestCard key={r.id} request={r} trip={t} isDriverView={false} isOffer
                      onAccept={() => updateRequestStatus(r.id, 'accepted')}
                      onReject={() => updateRequestStatus(r.id, 'rejected')}
                      onCancel={() => updateRequestStatus(r.id, 'cancelled')}
                      onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined}
                      onNavigation={r.status === 'accepted' ? () => openGoogleMapsNavigation(t, r) : undefined}
                      onPreviewRoute={() => { setPreviewTrip(t); setPreviewRequest(r); }} />;
                  })}
                </div>
              </section>
            )}

            {/* Passenger: my sent requests */}
            {!isDriver && displayableMySentRequests.length > 0 && (
              <section className="mb-6 rounded-3xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-sky-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Inbox className="h-4 w-4" /></span>
                  Mano aktyvios užklausos ({displayableMySentRequests.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {displayableMySentRequests.map((r) => {
                    const t = findTripById(r.driver_trip_id ?? r.trip_id)!;
                    return (
                      <RequestCard
                        key={r.id}
                        request={r}
                        trip={t}
                        isDriverView={false}
                        onCancel={() => updateRequestStatus(r.id, 'cancelled')}
                        onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined}
                        onNavigation={r.status === 'accepted' ? () => openGoogleMapsNavigation(t, r) : undefined}
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
              <section className="mb-6 rounded-3xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-blue-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><List className="h-4 w-4" /></span>
                  Mano skelbimai ({ownTrips.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {ownTrips.map((t) => {
                    const tripRequests = requestsByTrip.get(t.id) ?? [];
                    const pendingCount = tripRequests.filter((r) => r.status === 'pending').length;
                    return (
                      <TripCard
                        key={t.id}
                        trip={t}
                        currentTime={now}
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

            {/* Best matches */}
            {!hasActiveFilters && bestMatches.length > 0 && (
              <section className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-violet-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Sparkles className="h-4 w-4" /></span>
                  Geriausi atitikimai ({bestMatches.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {bestMatches.map((match, idx) => (
                    <div key={match.trip.id} className="w-full min-w-0">
                      <div className="mb-2 rounded-xl border border-indigo-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 px-3 py-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm shadow-indigo-200">
                              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-tight text-slate-900">
                                {idx === 0 ? 'Geriausias atitikimas' : `Atitikimas Nr. ${idx + 1}`}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                {match.reasons.slice(0, 3).join(' · ')}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex flex-shrink-0 items-center rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200">
                            {match.score}%
                            <span className="ml-1 hidden sm:inline">atitikimas</span>
                          </span>
                        </div>
                      </div>
                      <TripCard
                        trip={match.trip}
                        currentTime={now}
                        onSelect={isDriver ? () => setOfferTarget(match.trip) : () => {
                          setRequestInitialRoute(null);
                          setRequestPassengerTrip(nextOwnTrip ?? null);
                          setRequestTarget(match.trip);
                        }}
                        highlight={mySentRequestTripIds.has(match.trip.id)}
                        onPreviewRoute={() => {
                          setPreviewTrip(match.trip);
                          setPreviewRequest(mySentRequests.find((r) => r.trip_id === match.trip.id) ?? null);
                        }}
                        onShowProfile={() =>
                          setProfileTarget({ userId: match.trip.created_by ?? '', name: match.trip.name, trip: match.trip })
                        }
                        userRating={match.trip.created_by ? getUserRating(match.trip.created_by) : null}
                        selectLabel={isDriver ? 'Siūlyti pavežėjimą' : 'Siųsti užklausą'}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div ref={resultsSectionRef} className="scroll-mt-24">
            {corridorLoading && hasRouteSearch && (
              <div className="mb-6 flex min-h-20 items-center justify-center gap-2 rounded-3xl border border-teal-200 bg-teal-50/60 text-sm font-medium text-teal-800">
                <Loader2 className="h-4 w-4 animate-spin" /> Tikrinami pakeleivingi maršrutai pagal realius kelius…
              </div>
            )}
            {!corridorLoading && corridorError && hasRouteSearch && (
              <div role="alert" className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900 shadow-sm">
                Pakeleivingų maršrutų šiuo metu patikrinti nepavyko. Pabandykite paiešką dar kartą.
              </div>
            )}
            {!corridorLoading && corridorMatches.length > 0 && (
              <section className="mb-6 rounded-3xl border border-teal-200 bg-teal-50/60 p-4 shadow-sm sm:p-5">
                <h2 className="mb-1 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-teal-900">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><Route className="h-4 w-4" /></span>
                  Pakeleivingi maršrutai ({corridorMatches.length})
                </h2>
                <p className="mb-4 ml-10 text-xs leading-relaxed text-teal-800">Vairuotojas važiuoja kitu maršrutu, tačiau gali paimti ir išlaipinti pakeliui.</p>
                <div className="flex flex-col gap-4">
                  {corridorMatches.map((match) => (
                    <div key={match.trip.id} className="min-w-0">
                      <div className="mb-2 rounded-xl border border-teal-200 bg-white/80 px-3 py-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">Gali paimti su nedideliu apvažiavimu</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{match.reasons.slice(0, 3).join(' · ')}</p>
                            <p className="mt-1.5 text-xs font-medium text-teal-800">Papildomai apie {Math.round(match.detourKm)} km · {match.detourPct.toFixed(0)} % maršruto</p>
                          </div>
                          <span className="inline-flex flex-shrink-0 items-center rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-800">{match.score}%</span>
                        </div>
                      </div>
                      <TripCard
                        trip={match.trip}
                        currentTime={now}
                        onSelect={isDriver ? () => setOfferTarget(match.trip) : () => {
                          setRequestPassengerTrip(null);
                          setRequestInitialRoute(match.searchRoute);
                          setRequestTarget(match.trip);
                        }}
                        highlight={mySentRequestTripIds.has(match.trip.id)}
                        onPreviewRoute={() => { setPreviewTrip(match.trip); setPreviewRequest(null); }}
                        onShowProfile={() => setProfileTarget({ userId: match.trip.created_by ?? '', name: match.trip.name, trip: match.trip })}
                        userRating={match.trip.created_by ? getUserRating(match.trip.created_by) : null}
                        selectLabel={isDriver ? 'Siūlyti pavežėjimą' : 'Siųsti užklausą'}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {hasMoreTrips && <button onClick={() => setPublicLimit(limit => limit + 100)} className="form-input mb-4">Įkelti daugiau skelbimų</button>}
            {/* Other trips with filters */}
            <section className={`${hasSearchResults ? '' : 'min-h-[calc(100svh-6rem)]'} rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5`}>
              <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-slate-800">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{isDriver ? <Inbox className="h-4 w-4" /> : <Car className="h-4 w-4" />}</span>
                {othersLabel} ({filteredOtherTrips.length})
              </h2>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                resultCount={totalSearchResults}
              />
              {!hasSearchResults ? (
                <div className="flex min-h-[45svh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center sm:p-10">
                  <p className="text-slate-500 text-sm">
                    {hasActiveFilters
                      ? 'Pagal nurodytus kriterijus skelbimų nerasta.'
                      : 'Kol kas nėra skelbimų. Būkite pirmas, kuris pridės!'}
                  </p>
                  {!isDriver && hasRouteSearch && (
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Sukurti keleivio skelbimą
                    </button>
                  )}
                </div>
              ) : filteredOtherTrips.length > 0 ? (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {filteredOtherTrips.map((t) => {
                    const alreadyRequested = mySentRequestTripIds.has(t.id);
                    const myRequest = mySentRequests.find((r) => r.trip_id === t.id);
                    const isFocused = t.id === focusTripId;
                    return (
                      <div
                        key={t.id}
                        id={`trip-${t.id}`}
                        className={isFocused ? 'rounded-2xl ring-4 ring-indigo-300 ring-offset-2' : ''}
                      >
                      <TripCard
                        trip={t}
                        currentTime={now}
                        onSelect={isDriver ? () => setOfferTarget(t) : () => {
                          setRequestInitialRoute(null);
                          setRequestPassengerTrip(null);
                          setRequestTarget(t);
                        }}
                        highlight={alreadyRequested || isFocused}
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
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
