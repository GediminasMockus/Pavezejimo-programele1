import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}

// App: remove cross-session stale filters, centralize lifecycle, prioritize accepted requests,
// and make notifications open their related trip/request.
{
  const path = 'src/App.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    "import { navigationUrl } from '@/lib/navigation';",
    "import { navigationUrl } from '@/lib/navigation';\nimport { isWithinListingWindow } from '@/lib/rideState';",
    'App rideState import',
  );

  const filterStart = s.indexOf("  const [filters, setFilters] = useState<FilterState>(() => {");
  const filterEndMarker = "  useEffect(() => { setPublicLimit(100); }, [filters]);";
  const filterEnd = s.indexOf(filterEndMarker, filterStart);
  if (filterStart < 0 || filterEnd < 0) throw new Error('Could not locate ListScreen filter initialization');
  const newFilter = "  const [filters, setFilters] = useState<FilterState>(() => ({\n    ...emptyFilters,\n    ...initialFilters,\n    radiusKm: initialFilters.radiusKm ?? 0,\n  }));\n";
  s = s.slice(0, filterStart) + newFilter + s.slice(filterEnd);

  s = replaceOnce(
    s,
    "() => trips.filter((t) => (t.status === 'active' && (t.created_by === clientId || new Date(t.departure_time).getTime() > now - 24 * 60 * 60 * 1000)) || t.created_by === clientId),",
    "() => trips.filter((t) => (t.status === 'active' && (t.created_by === clientId || isWithinListingWindow(t, now))) || t.created_by === clientId),",
    'visible trip lifecycle',
  );
  s = replaceOnce(
    s,
    "const otherTrips = useMemo(() => visibleTrips.filter((t) => t.role === othersRole && t.created_by !== clientId && t.status === 'active' && !t.deleted_at && new Date(t.departure_time).getTime() > now - 24 * 60 * 60 * 1000), [visibleTrips, othersRole, clientId, now]);",
    "const otherTrips = useMemo(() => visibleTrips.filter((t) => t.role === othersRole && t.created_by !== clientId && t.status === 'active' && !t.deleted_at && isWithinListingWindow(t, now)), [visibleTrips, othersRole, clientId, now]);",
    'other trip lifecycle',
  );

  const pendingStart = s.indexOf("                {pendingDriverRequests.length > 0 && (");
  const acceptedStart = s.indexOf("                {acceptedDriverRequests.length > 0 && (", pendingStart);
  const rejectedStart = s.indexOf("                {rejectedDriverRequests.length > 0 && (", acceptedStart);
  if (pendingStart < 0 || acceptedStart < 0 || rejectedStart < 0) throw new Error('Could not locate request section blocks');
  const pendingBlock = s.slice(pendingStart, acceptedStart);
  const acceptedBlock = s.slice(acceptedStart, rejectedStart);
  s = s.slice(0, pendingStart) + acceptedBlock + pendingBlock + s.slice(rejectedStart);

  const notificationUsage = `          <NotificationDrawer\n            userId={userId}\n            onClose={() => setShowNotifications(false)}\n          />`;
  const notificationReplacement = `          <NotificationDrawer\n            userId={userId}\n            onClose={() => setShowNotifications(false)}\n            onOpenTarget={(notification) => {\n              setShowNotifications(false);\n              const request = notification.related_request_id\n                ? allRequests.find((item) => item.id === notification.related_request_id) ?? null\n                : null;\n              const tripId = request?.driver_trip_id ?? request?.trip_id ?? notification.related_trip_id;\n              const trip = tripId ? findTripById(tripId) : undefined;\n              if (!trip) return;\n              if (request?.status === 'accepted') {\n                openChat(trip, request);\n                return;\n              }\n              setPreviewTrip(trip);\n              setPreviewRequest(request);\n            }}\n          />`;
  s = replaceOnce(s, notificationUsage, notificationReplacement, 'notification deep link');
  write(path, s);
}

// Notification drawer: make every notification a semantic button and support deep-link callback.
{
  const path = 'src/components/NotificationDrawer.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    `interface NotificationDrawerProps {\n  userId: string;\n  onClose: () => void;\n}\n\nexport function NotificationDrawer({ userId, onClose }: NotificationDrawerProps) {`,
    `interface NotificationDrawerProps {\n  userId: string;\n  onClose: () => void;\n  onOpenTarget?: (notification: Notification) => void;\n}\n\nexport function NotificationDrawer({ userId, onClose, onOpenTarget }: NotificationDrawerProps) {`,
    'NotificationDrawer props',
  );
  s = replaceOnce(s, 'className="w-8 h-8 rounded-full', 'className="touch-target rounded-full', 'notification close touch target');
  s = replaceOnce(
    s,
    `                <div\n                  key={notification.id}\n                  className={\`p-4 hover:bg-slate-50 transition-colors cursor-pointer \${!notification.read ? 'bg-blue-50/50' : ''}\`}\n                  onClick={() => {\n                    if (!notification.read) markAsRead(notification.id);\n                  }}\n                >`,
    `                <button\n                  type="button"\n                  key={notification.id}\n                  className={\`w-full text-left p-4 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 \${!notification.read ? 'bg-blue-50/50' : ''}\`}\n                  onClick={() => {\n                    if (!notification.read) void markAsRead(notification.id);\n                    onOpenTarget?.(notification);\n                  }}\n                >`,
    'notification item button',
  );
  s = replaceOnce(s, '                </div>\n              ))}', '                </button>\n              ))}', 'notification item closing tag');
  write(path, s);
}

// Trip cards: clearer lifecycle, larger touch targets, calmer visual hierarchy.
{
  const path = 'src/components/TripCard.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    "import { formatDateTime, formatPrice } from '@/lib/format';",
    "import { formatDateTime, formatPrice } from '@/lib/format';\nimport { isPastDeparture, remainingListingHours } from '@/lib/rideState';",
    'TripCard lifecycle import',
  );
  s = replaceOnce(
    s,
    "  const priceStr = formatPrice(trip);",
    "  const priceStr = formatPrice(trip);\n  const departurePassed = isPastDeparture(trip);\n  const remainingHours = departurePassed ? remainingListingHours(trip) : null;",
    'TripCard lifecycle state',
  );
  s = s.replaceAll('w-7 h-7 rounded-lg', 'w-11 h-11 rounded-xl');
  s = replaceOnce(
    s,
    `          {trip.is_recurring && (\n            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm">\n              <Repeat className="w-3 h-3" />\n              Pasikartojantis\n            </span>\n          )}`,
    `          {trip.is_recurring && (\n            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">\n              <Repeat className="w-3 h-3" />\n              Pasikartojantis\n            </span>\n          )}\n          {departurePassed && !trip.is_recurring && remainingHours !== null && remainingHours > 0 && (\n            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">\n              <Clock className="w-3 h-3" />\n              Kelionė įvyko · pašalinimas po {remainingHours} val.\n            </span>\n          )}`,
    'TripCard expired badge',
  );
  s = s.replaceAll('bg-gradient-to-r from-blue-500 to-blue-600 text-white', 'bg-blue-600 text-white');
  s = s.replaceAll('bg-gradient-to-r from-emerald-500 to-emerald-600 text-white', 'bg-emerald-600 text-white');
  s = s.replaceAll('bg-gradient-to-r from-amber-400 to-orange-500 shadow-md shadow-amber-500/30', 'bg-amber-500');
  s = s.replaceAll('bg-gradient-to-r from-slate-100 to-slate-200', 'bg-slate-100');
  s = s.replaceAll('hover:from-slate-200 hover:to-slate-300', 'hover:bg-slate-200');
  s = s.replaceAll('bg-gradient-to-r from-blue-500 to-indigo-600', 'bg-blue-600');
  s = s.replaceAll('hover:from-blue-600 hover:to-indigo-700', 'hover:bg-blue-700');
  s = s.replaceAll('bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600', 'bg-blue-600');
  s = s.replaceAll('hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700', 'hover:bg-blue-700');
  s = s.replaceAll(' animate-gradient-x', '');
  write(path, s);
}

// Tests: lock down the 24h/recurring rules and accepted-first ordering.
{
  const path = 'tests/frontend.test.tsx';
  let s = read(path);
  s = replaceOnce(
    s,
    "import { applyFilters, emptyFilters, findBestMatches } from '../src/lib/tripFilters';",
    "import { applyFilters, emptyFilters, findBestMatches } from '../src/lib/tripFilters';\nimport { isWithinListingWindow, remainingListingHours, sortRequestsByPriority } from '../src/lib/rideState';",
    'test rideState import',
  );
  const anchor = ` it('rejects incompatible capacity and times from recommendations', () => {\n   const passenger = { ...trip, role: 'passenger' as const, seats: 3 };\n   expect(findBestMatches(passenger,[trip])).toHaveLength(0);\n   expect(findBestMatches({ ...passenger, seats: 1 },[{ ...trip, departure_time: '2030-09-13T12:00:00Z' }])).toHaveLength(0);\n   expect(findBestMatches({ ...passenger, seats: 1 },[trip])).toHaveLength(1);\n   expect(applyFilters([trip],{ ...emptyFilters, maxPrice: '10,5' })).toHaveLength(1);\n });`;
  const replacement = `${anchor}\n it('keeps non-recurring listings for 24h and recurring listings available', () => {\n   const now = Date.parse('2030-09-13T12:00:00Z');\n   const recent = { ...trip, departure_time: '2030-09-12T13:00:00Z', is_recurring: false } as Trip;\n   const expired = { ...trip, departure_time: '2030-09-12T11:59:59Z', is_recurring: false } as Trip;\n   const recurring = { ...trip, departure_time: '2029-01-01T00:00:00Z', is_recurring: true } as Trip;\n   expect(isWithinListingWindow(recent, now)).toBe(true);\n   expect(remainingListingHours(recent, now)).toBe(1);\n   expect(isWithinListingWindow(expired, now)).toBe(false);\n   expect(isWithinListingWindow(recurring, now)).toBe(true);\n });\n it('sorts accepted ride requests before pending and rejected ones', () => {\n   const base = { created_at: '2030-01-01T00:00:00Z' };\n   const sorted = sortRequestsByPriority([\n     { ...base, status: 'rejected' as const },\n     { ...base, status: 'pending' as const },\n     { ...base, status: 'accepted' as const },\n   ]);\n   expect(sorted.map(item => item.status)).toEqual(['accepted','pending','rejected']);\n });`;
  s = replaceOnce(s, anchor, replacement, 'rideState tests');
  write(path, s);
}

// Translation bridge: include the new lifecycle sentence while the UI migrates to direct keys.
{
  const path = 'src/lib/useUiTranslation.ts';
  let s = read(path);
  const patternAnchor = "  [/^Į: (.*)$/, m => `To: ${m[1]}`]";
  s = replaceOnce(
    s,
    patternAnchor,
    `${patternAnchor},\n  [/^Kelionė įvyko · pašalinimas po (\\d+) val\\.$/, m => \`Trip ended · removed in \${m[1]} h\`]`,
    'expired translation pattern',
  );
  write(path, s);
}

console.log('Architecture refactor applied successfully');
