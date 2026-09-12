import { useUnreadCount } from '@/lib/useUnreadCount';
import { useRoadMatches } from '@/lib/useRoadMatches';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { withRetry } from '@/lib/retry';
import {
  Car,
  ArrowLeft,
  Plus,
  Loader2,
  Map as MapIcon,
  List,
  Grid,
  Bell,
  Inbox,
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
import { MapView, type MapMarker } from '@/components/MapView';
import { useGeolocation } from '@/lib/useGeolocation';
import { RequestModal } from '@/components/RequestModal';
import { RequestCard } from '@/components/RequestCard';
import { OfferModal } from '@/components/OfferModal';
import { FilterBar } from '@/components/FilterBar';
import { applyFilters, emptyFilters, findBestMatches, type FilterState } from '@/lib/tripFilters';
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

export default function App() {
  const [search, setSearch] = useState<FilterState>(emptyFilters);
  const [startForm, setStartForm] = useState(false);
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
          onPick={(role, searchFilters, create = false) => {
            setSearch(searchFilters ?? emptyFilters);
            setStartForm(create);
            setActiveRole(role);
            setScreen('list');
          }}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {screen === 'list' && activeRole && (
        <ListScreen
          key={userId}
          role={activeRole}
          initialFilters={search}
          initialForm={startForm}
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

function ListScreen({ role, userId, onBack, toast, initialFilters, initialForm }: { initialFilters: FilterState; initialForm: boolean; role: TripRole; userId: string; onBack: () => void; toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void } }) {
  const [trips, setTrips] = useState<Trip[]>([]);
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
  const [offerTarget, setOfferTarget] = useState<Trip | null>(null);
  const [previewTrip, setPreviewTrip] = useState<Trip | null>(null);
  const [previewRequest, setPreviewRequest] = useState<RideRequest | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; name: string; trip: Trip } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'grid'>(() => {
    const saved = localStorage.getItem('viewMode');
    return (saved === 'list' || saved === 'map' || saved === 'grid') ? saved : 'list';
  });
  const loadVersion = useRef(0);
  const loadedOnce = useRef(false);
  const [publicLimit, setPublicLimit] = useState(100);
  const [hasMoreTrips, setHasMoreTrips] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() => {
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
  const { position: userPos, status: gpsStatus } = useGeolocation();

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
      const [publicResult, privateTrips] = await Promise.all([
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
      ]);
      if (version !== loadVersion.current) return;
      if (publicResult.error) {
        setError('Nepavyko įkelti skelbimų. Bandykite vėliau.');
      } else {
        const merged = new Map<string, Trip>();
        setHasMoreTrips((publicResult.data?.length ?? 0) > publicLimit);
        for (const trip of (publicResult.data ?? []).slice(0, publicLimit)) merged.set(trip.id, trip as Trip);
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
  const ownLabel = isDriver ? 'Siūlau pavežėti' : 'Ieškau kelionės';
  const othersLabel = isDriver ? 'Keleivių skelbimai' : 'Vairuotojų pasiūlymai';
  const othersRole: TripRole = isDriver ? 'passenger' : 'driver';

  const visibleTrips = useMemo(
    () => trips.filter((t) => (t.status === 'active' && (t.created_by === clientId || new Date(t.departure_time).getTime() > now)) || t.created_by === clientId),
    [trips, clientId, now],
  );

  const ownTrips = useMemo(() => visibleTrips.filter((t) => t.role === role && t.created_by === clientId).map(t => ({ ...t, available_seats: t.seats - allRequests.filter(r => (r.driver_trip_id ?? r.trip_id) === t.id && r.status === "accepted").reduce((sum, r) => sum + r.seats_needed, 0) })), [visibleTrips, role, clientId, allRequests]);
  const otherTrips = useMemo(() => visibleTrips.filter((t) => t.role === othersRole && t.created_by !== clientId && t.status === 'active' && !t.deleted_at && new Date(t.departure_time).getTime() > now), [visibleTrips, othersRole, clientId, now]);
  const filteredOtherTrips = useMemo(
    () => applyFilters(otherTrips, filters, userPos?.lat, userPos?.lng).sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()),
    [otherTrips, filters, userPos],
  );

  const nextOwnTrip = useMemo(() => ownTrips.filter(t => t.status === 'active' && new Date(t.departure_time).getTime() >= now).sort((a,b) => new Date(a.departure_time).getTime()-new Date(b.departure_time).getTime())[0], [ownTrips, now]);
  const preliminaryMatches = useMemo(() => nextOwnTrip ? findBestMatches({ ...nextOwnTrip, seats: nextOwnTrip.available_seats }, otherTrips, 3) : [], [nextOwnTrip, otherTrips]);
  const bestMatches = useRoadMatches(nextOwnTrip, preliminaryMatches);

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
            initialSearch={initialFilters}
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
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4 mb-4' : 'flex flex-col gap-3 mb-4'}>
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

                {rejectedDriverRequests.length > 0 && (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                    <p className={viewMode === 'grid' ? 'col-span-full text-xs font-semibold text-red-500 uppercase tracking-wide' : 'text-xs font-semibold text-red-500 uppercase tracking-wide'}>Atmestos</p>
                    {rejectedDriverRequests.map((r) => {
                      const t = findTripById(r.driver_trip_id ?? r.trip_id);
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
                  {mySentOffers.map((r) => { const t = findTripById(r.driver_trip_id ?? r.trip_id); if (!t) return null; return <RequestCard key={r.id} request={r} trip={t} isDriverView={true} isOffer onCancel={() => updateRequestStatus(r.id, 'cancelled')} onChat={r.status === 'accepted' ? () => openChat(t, r) : undefined} onNavigation={r.status === 'accepted' ? () => openGoogleMapsNavigation(t, r) : undefined} />; })}
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
                    const t = findTripById(r.driver_trip_id ?? r.trip_id);
                    if (!t) return null;
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
            {!isDriver && mySentRequests.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Mano užklausos ({mySentRequests.length})
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
                  {mySentRequests.map((r) => {
                    const t = findTripById(r.driver_trip_id ?? r.trip_id);
                    if (!t) return null;
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

            {/* Best matches */}
            {bestMatches.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Geriausi atitikimai ({bestMatches.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {bestMatches.map((match, idx) => (
                    <div key={match.trip.id} className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              {match.score} taškų
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {match.reasons.slice(0, 3).map((reason, i) => (
                                <span key={i} className="text-xs text-slate-600">
                                  {reason}
                                  {i < Math.min(match.reasons.length - 1, 2) && ' · '}
                                </span>
                              ))}
                            </div>
                          </div>
                          <TripCard
                            trip={match.trip}
                            onSelect={isDriver ? () => setOfferTarget(match.trip) : () => setRequestTarget(match.trip)}
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
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {hasMoreTrips && <button onClick={() => setPublicLimit(limit => limit + 100)} className="form-input mb-4">Įkelti daugiau skelbimų</button>}
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
