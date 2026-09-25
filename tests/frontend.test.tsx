import { rankCandidates } from '../supabase/functions/_shared/candidates';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { withRetry } from '../src/lib/retry';
import { fetchAllRows } from '../src/lib/pagination';
import { mapPopup } from '../src/lib/mapPopup';
import { navigationUrl } from '../src/lib/navigation';
import { applyFilters, isDiscoverableTrip, emptyFilters, findBestMatches } from '../src/lib/tripFilters';
import { HomeScreen } from '../src/components/HomeScreen';
import { ChatDrawer } from '../src/components/ChatDrawer';
import { RequestModal } from '../src/components/RequestModal';
import { TripForm } from '../src/components/TripForm';
import { AddressInput, type AddressValue } from '../src/components/AddressInput';
import { NotificationDrawer } from '../src/components/NotificationDrawer';
import { RequestCard } from '../src/components/RequestCard';
import { TripCard } from '../src/components/TripCard';
import { FilterBar } from '../src/components/FilterBar';
import type { Trip, RideRequest } from '../src/lib/supabase';
import { evaluateCorridor } from '../supabase/functions/_shared/corridor';
import { formatTripExpiryCountdown } from '../src/lib/format';
import { isNotificationFresh, NOTIFICATION_RETENTION_MS } from '../src/lib/notificationRetention';
import { fetchDrivingDistance, fetchDrivingRoute } from '../src/lib/routing';
import { useBodyScrollLock } from '../src/lib/useBodyScrollLock';
const mock = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(),
  request: { id: 'request', passenger_id: 'passenger', status: 'accepted', driver_confirmed: true, passenger_confirmed: true },
  notifications: [] as unknown[],
}));
vi.mock('../src/lib/supabase', () => {
 const result = (data: unknown) => {
   const chain: Record<string, unknown> = {};
   for (const name of ['select','delete','eq','gte','lt','order','limit','single','maybeSingle']) chain[name] = () => chain;
   chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null, count: 0 }).then(resolve);
   return chain;
 };
 const channel = { on: () => channel, subscribe: () => channel };
 mock.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'get_my_matches' ? [{ id: 'match', request_id: 'request' }] : [{ display_name: 'Tester', is_admin: false }], error: null }));
 mock.from.mockImplementation((name: string) => result(name === 'ride_requests' ? mock.request : name === 'notifications' ? mock.notifications : []));
 return { supabase: { rpc: mock.rpc, from: mock.from, channel: () => channel, removeChannel: vi.fn(),
   auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } } }) } } };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mock.notifications = []; mock.request = { ...mock.request, status: 'accepted' }; });
const trip = { id: 'trip', role: 'driver', status: 'active', created_by: 'driver', seats: 2, available_seats: 2,
 from_location: 'Vilnius', to_location: 'Kaunas', from_lat: 54.68, from_lng: 25.27, to_lat: 54.89, to_lng: 23.9,
 departure_time: '2030-09-12T12:00:00Z', price: 10, price_unit: 'asmeniui', name: 'Driver' } as Trip;
describe('data helpers', () => {
 it('keeps the background locked until the last touch dialog closes', () => {
   vi.stubGlobal('matchMedia', () => ({ matches: true }));
   const scrollTo = vi.fn();
   vi.stubGlobal('scrollTo', scrollTo);
   const Dialog = () => { useBodyScrollLock(); return <div />; };
   const view = render(<><Dialog /><Dialog /></>);
   expect(document.body.style.position).toBe('fixed');
   view.rerender(<Dialog />);
   expect(document.body.style.position).toBe('fixed');
   view.unmount();
   expect(document.body.style.position).toBe('');
   expect(scrollTo).toHaveBeenCalledTimes(1);
 });
 it('keeps old recurring listings visible but hides expired, deleted and completed listings', () => {
   const now = Date.parse('2030-09-15T12:00:00Z');
   expect(isDiscoverableTrip({ ...trip, is_recurring: true }, now)).toBe(true);
   expect(isDiscoverableTrip({ ...trip, is_recurring: false }, now)).toBe(false);
   expect(isDiscoverableTrip({ ...trip, is_recurring: true, deleted_at: '2030-09-14T12:00:00Z' }, now)).toBe(false);
   expect(isDiscoverableTrip({ ...trip, is_recurring: true, status: 'completed' }, now)).toBe(false);
   expect(isDiscoverableTrip({ ...trip, departure_time: '2030-09-15T11:00:00Z' }, now)).toBe(true);
 });
 it('ranks matching trips beyond the first 100 rows and propagates later page failures', async () => {
   const rows = Array.from({ length: 251 }, (_, i) => ({ id: String(i).padStart(3, '0'), day: i < 100 ? 'other' : 'wanted', distance: 251 - i }));
   const page = vi.fn((from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }));
   const result = await rankCandidates(page, row => row.day === 'wanted', row => row.distance, 12);
   expect(result.map(row => row.id)).toEqual(rows.slice(-12).reverse().map(row => row.id));
   expect(page).toHaveBeenCalledTimes(3);
   await expect(rankCandidates((from, to) => Promise.resolve(from === 0
     ? { data: rows.slice(from, to + 1), error: null }
     : { data: null, error: new Error('page failed') }), () => true, () => 0, 12)).rejects.toThrow('page failed');
 });
 it('calculates an ordered road route through every confirmed waypoint', async () => {
   const fetchMock = vi.fn().mockResolvedValue({
     ok: true,
     json: async () => ({ routes: [{ distance: 123456, geometry: { coordinates: [[25.1, 54.1], [24.2, 55.2]] } }] }),
   });
   vi.stubGlobal('fetch', fetchMock);
   const route = await fetchDrivingRoute([[54.1, 25.1], [54.5, 24.5], [55.2, 24.2]]);
   expect(fetchMock).toHaveBeenCalledWith(
     expect.stringContaining('/25.1,54.1;24.5,54.5;24.2,55.2?'),
     { signal: undefined },
   );
   expect(route?.distance).toBe(123.456);
   expect(route?.coordinates).toEqual([[54.1, 25.1], [55.2, 24.2]]);
 });
 it('uses the map routing provider for card kilometers and deduplicates identical routes', async () => {
   const fetchMock = vi.fn().mockResolvedValue({
     ok: true, json: async () => ({ routes: [{ distance: 98765 }] }),
   });
   vi.stubGlobal('fetch', fetchMock);
   const points: [number, number][] = [[54.123, 25.456], [55.789, 24.321]];
   const [first, second] = await Promise.all([fetchDrivingDistance(points), fetchDrivingDistance(points)]);
   expect(first).toBe(98.765);
   expect(second).toBe(first);
   expect(fetchMock).toHaveBeenCalledTimes(1);
   expect(fetchMock.mock.calls[0][0]).toContain('/25.456,54.123;24.321,55.789?overview=false');
 });
 it('loads road kilometers when a trip card enters view', async () => {
   let showCard: (() => void) | undefined;
   vi.stubGlobal('IntersectionObserver', class {
     constructor(callback: IntersectionObserverCallback) {
       showCard = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as IntersectionObserver);
     }
     observe() {}
     disconnect() {}
   });
   const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ distance: 123456 }] }) });
   vi.stubGlobal('fetch', fetchMock);
   render(<TripCard trip={{ ...trip, id: 'visible-card', from_lat: 54.681, to_lat: 54.891 }} />);
   expect(screen.getByText('Kelio km skaičiuojami…')).toBeTruthy();
   expect(fetchMock).not.toHaveBeenCalled();
   showCard!();
   expect(await screen.findByText('123 km keliu')).toBeTruthy();
   expect(fetchMock).toHaveBeenCalledTimes(1);
 });
 it('keeps notifications for exactly 48 hours', () => {
   const now = new Date('2030-09-12T12:00:00Z').getTime();
   expect(NOTIFICATION_RETENTION_MS).toBe(48 * 60 * 60 * 1000);
   expect(isNotificationFresh('2030-09-10T12:00:00Z', now)).toBe(true);
   expect(isNotificationFresh('2030-09-10T11:59:59Z', now)).toBe(false);
 });
 it('shows the remaining 24-hour retention time after departure', () => {
   const departure = '2030-09-12T12:00:00Z';
   expect(formatTripExpiryCountdown(departure, new Date('2030-09-12T11:59:00Z').getTime())).toBeNull();
   expect(formatTripExpiryCountdown(departure, new Date('2030-09-12T13:15:00Z').getTime())).toBe('Liko 22 val. 45 min.');
   expect(formatTripExpiryCountdown(departure, new Date('2030-09-13T12:00:00Z').getTime())).toBe('Liko 0 min.');
 });
 it('retries transient Supabase responses but not authorization failures', async () => {
   const temporary = vi.fn().mockResolvedValueOnce({ error: { message: 'busy' }, status: 503 }).mockResolvedValue({ data: [1], error: null });
   expect(await withRetry(temporary, { delay: 0 })).toEqual({ data: [1], error: null });
   expect(temporary).toHaveBeenCalledTimes(2);
   const denied = vi.fn().mockResolvedValue({ error: { message: 'denied' }, status: 403 });
   await withRetry(denied, { delay: 0 }); expect(denied).toHaveBeenCalledTimes(1);
 });
 it('reads beyond the API page limit and stops on errors', async () => {
   const rows = Array.from({ length: 451 }, (_,i) => i);
   expect(await fetchAllRows((from,to) => Promise.resolve({ data: rows.slice(from,to+1), error: null }))).toEqual(rows);
   await expect(fetchAllRows(() => Promise.resolve({ data: null, error: new Error('failed') }))).rejects.toThrow('failed');
 });
 it('treats untrusted popup content as text', () => {
   const malicious = '<img src=x onerror=alert(1)>';
   const popup = mapPopup('Address',malicious);
   expect(popup.querySelector('img')).toBeNull(); expect(popup.textContent).toContain(malicious);
 });
 it('encodes navigation names and includes zero coordinates', () => {
   const url = new URL(navigationUrl({ ...trip, from_lat: 0, from_lng: 0, to_lat: null, to_lng: null, to_location: 'A&B / C' }));
   expect(url.searchParams.get('origin')).toBe('0,0');
   expect(url.searchParams.get('destination')).toBe('A&B / C');
 });
 it('rejects incompatible capacity and times from recommendations', () => {
   const passenger = { ...trip, role: 'passenger' as const, seats: 3 };
   expect(findBestMatches(passenger,[trip])).toHaveLength(0);
   expect(findBestMatches({ ...passenger, seats: 1 },[{ ...trip, departure_time: '2030-09-13T12:00:00Z' }])).toHaveLength(0);
   expect(findBestMatches({ ...passenger, seats: 1 },[trip])).toHaveLength(1);
   expect(applyFilters([trip],{ ...emptyFilters, maxPrice: '10,5' })).toHaveLength(1);
 });
 it('accepts forward road corridors with a practical total detour', () => {
   const valid = { pickupDistanceKm: 4, dropoffDistanceKm: 6, pickupProgress: 0.25, dropoffProgress: 0.75,
     detourKm: 12, detourPct: 12, passageTimeDifferenceMinutes: 45, seatsAvailable: 3, seatsNeeded: 2 };
   expect(evaluateCorridor(valid).qualifies).toBe(true);
   expect(evaluateCorridor({ ...valid, pickupDistanceKm: 60.2, dropoffDistanceKm: 4.4, detourKm: 34.2, detourPct: 13.1 }).qualifies).toBe(true);
   expect(evaluateCorridor({ ...valid, pickupDistanceKm: 2, dropoffDistanceKm: 4, detourKm: 70, detourPct: 25 }).qualifies).toBe(true);
   expect(evaluateCorridor({ ...valid, pickupDistanceKm: 20, dropoffDistanceKm: 20, detourKm: 45.1 }).qualifies).toBe(false);
   expect(evaluateCorridor({ ...valid, pickupProgress: 0.8, dropoffProgress: 0.3 }).qualifies).toBe(false);
   expect(evaluateCorridor({ ...valid, pickupDistanceKm: 20, dropoffDistanceKm: 20, detourPct: 20.1 }).qualifies).toBe(false);
   expect(evaluateCorridor({ ...valid, passageTimeDifferenceMinutes: 91 }).qualifies).toBe(false);
   expect(evaluateCorridor({ ...valid, seatsAvailable: 1 }).qualifies).toBe(false);
 });
 it('returns no rides when the searched route does not match', () => {
   expect(applyFilters([trip], {
     ...emptyFilters,
     fromLocation: 'Klaipėda',
     toLocation: 'Šiauliai',
   })).toHaveLength(0);
   expect(applyFilters([trip], {
     ...emptyFilters,
     fromLocation: 'Vilnius, Centras',
     toLocation: 'Kaunas',
   })).toHaveLength(0);
   expect(applyFilters([{ ...trip, from_location: 'Vilnius, Centras' }], {
     ...emptyFilters,
     fromLocation: 'Vilnius, Centras',
     toLocation: 'Kaunas',
   })).toHaveLength(1);
 });
});
describe('user workflows', () => {
 it('requires confirmation before cancelling an accepted ride', async () => {
   const onCancel = vi.fn();
   const acceptedRequest = {
     ...mock.request,
     trip_id: trip.id,
     pickup_location: 'Vilnius',
     dropoff_location: 'Kaunas',
     status: 'accepted',
     request_type: 'passenger_request',
     completed_at: null,
     created_at: '2030-09-12T10:00:00Z',
   } as RideRequest;
   render(<RequestCard request={acceptedRequest} trip={trip} isDriverView={false} onCancel={onCancel} />);
   fireEvent.click(screen.getByRole('button', { name: 'Atšaukti kelionę' }));
   expect(onCancel).not.toHaveBeenCalled();
   expect(screen.getByRole('dialog', { name: 'Atšaukti kelionę?' })).toBeTruthy();
   fireEvent.click(screen.getByRole('button', { name: 'Taip, atšaukti kelionę' }));
   await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
 });
 it('opens the related chat from a new-message notification', async () => {
   const onOpenChat = vi.fn();
   mock.notifications = [{
     id: 'notification', user_id: 'driver', type: 'new_message', title: 'Nauja žinutė',
     message: 'Keleivis: Sveiki', related_trip_id: null, related_request_id: 'request',
     read: false, created_at: new Date().toISOString(),
   }];
   render(<NotificationDrawer userId="driver" onClose={() => {}} onOpenChat={onOpenChat} />);
   const notification = await screen.findByRole('button', { name: /nauja žinutė.*atidaryti pokalbį/i });
   fireEvent.click(notification);
   expect(onOpenChat).toHaveBeenCalledWith('request');
 });
 it('opens the exact request from both unread and read notifications', async () => {
   const onOpenRequest = vi.fn();
   mock.notifications = [{
     id: 'offer-notice', user_id: 'passenger', type: 'new_offer', title: 'Naujas pasiūlymas',
     message: 'Vairuotojas pasiūlė kelionę', related_trip_id: null, related_request_id: 'offer-123',
     read: false, created_at: new Date().toISOString(),
   }];
   const view = render(<NotificationDrawer userId="passenger" onClose={() => {}} onOpenRequest={onOpenRequest} />);
   fireEvent.click(await screen.findByRole('button', { name: /naujas pasiūlymas.*peržiūrėti pasiūlymą/i }));
   expect(onOpenRequest).toHaveBeenCalledWith('offer-123', 'passenger');
   view.unmount();
   mock.notifications = [{ ...(mock.notifications[0] as object), read: true }];
   render(<NotificationDrawer userId="passenger" onClose={() => {}} onOpenRequest={onOpenRequest} />);
   fireEvent.click(await screen.findByRole('button', { name: /naujas pasiūlymas.*peržiūrėti pasiūlymą/i }));
   expect(onOpenRequest).toHaveBeenCalledTimes(2);
 });
 it('shows a rejected request even after its trip is no longer available', () => {
   const rejected = {
     id: 'old-request', status: 'rejected', request_type: 'passenger_request',
     pickup_location: 'Vilnius', dropoff_location: 'Kaunas', seats_needed: 1,
     passenger_name: 'Keleivis', driver_message: 'Vietų nėra', created_at: '2030-09-12T10:00:00Z',
     pickup_lat: null, pickup_lng: null, dropoff_lat: null, dropoff_lng: null,
   } as RideRequest;
   render(<RequestCard request={rejected} trip={null} isDriverView={false} highlighted />);
   expect(screen.getByText('Atmesta')).toBeTruthy();
   expect(screen.getByText('Vietų nėra')).toBeTruthy();
   expect(screen.queryByRole('button', { name: /Atšaukti užklausą|Patvirtinti/i })).toBeNull();
 });
 it('keeps read notifications in All while Unread only shows new items', async () => {
   mock.notifications = [
     { id: 'read', user_id: 'driver', type: 'trip_reminder', title: 'Senas įvykis', message: 'Perskaityta', read: true, created_at: new Date().toISOString() },
     { id: 'unread', user_id: 'driver', type: 'trip_reminder', title: 'Naujas įvykis', message: 'Neperskaityta', read: false, created_at: new Date().toISOString() },
   ];
   render(<NotificationDrawer userId="driver" onClose={() => {}} />);
   expect(await screen.findByRole('button', { name: 'Senas įvykis' })).toBeTruthy();
   fireEvent.click(screen.getByRole('button', { name: 'Neperskaityti (1)' }));
   expect(screen.queryByRole('button', { name: 'Senas įvykis' })).toBeNull();
   fireEvent.click(screen.getByRole('button', { name: 'Naujas įvykis' }));
   expect(screen.getByText('Neperskaitytų pranešimų nėra')).toBeTruthy();
   fireEvent.click(screen.getByRole('button', { name: 'Visi' }));
   expect(screen.getByRole('button', { name: 'Senas įvykis' })).toBeTruthy();
 });
 it('opens a trip reminder through its related trip, including after it was read', async () => {
   const onOpenTrip = vi.fn();
   mock.notifications = [{
     id: 'reminder', user_id: 'driver', type: 'trip_reminder', title: 'Kelionės priminimas',
     message: 'Artėja išvykimas', related_trip_id: 'own-trip-123', related_request_id: null,
     read: true, created_at: new Date().toISOString(),
   }];
   render(<NotificationDrawer userId="driver" onClose={() => {}} onOpenTrip={onOpenTrip} />);
   fireEvent.click(await screen.findByRole('button', { name: /kelionės priminimas.*peržiūrėti kelionę/i }));
   expect(onOpenTrip).toHaveBeenCalledWith('own-trip-123');
 });
 it('shows a recent home event that opens its request directly', async () => {
   const onOpenRequest = vi.fn();
   mock.notifications = [{
     id: 'request-notice', user_id: 'driver', type: 'new_request', title: 'Nauja užklausa',
     message: 'Keleivis nori prisijungti', related_trip_id: null, related_request_id: 'request-456',
     read: false, created_at: new Date().toISOString(),
   }];
   render(<HomeScreen userId="driver" onPick={() => {}} onSignOut={() => {}} onOpenRequest={onOpenRequest} />);
   fireEvent.click(await screen.findByRole('button', { name: /nauja užklausa/i }));
   expect(onOpenRequest).toHaveBeenCalledWith('request-456', 'driver');
 });
 it('passes the entered route to search and creation', async () => {
   const onPick=vi.fn();
   render(<HomeScreen userId="passenger" onPick={onPick} onSignOut={() => {}} />);
   fireEvent.change(screen.getByLabelText('Iš kur'),{ target: { value: 'Trakai' } });
   fireEvent.change(screen.getByLabelText('Į kur'),{ target: { value: 'Vilnius' } });
   expect(screen.getByRole('button',{name:'Peržiūrėti visas keliones'})).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:/Rasti kelion/}));
   expect(onPick).toHaveBeenLastCalledWith('passenger',expect.objectContaining({fromLocation:'Trakai',toLocation:'Vilnius'}),false);
   fireEvent.click(screen.getByRole('button',{name:/Vežu keleivius/}));
   expect(screen.getByRole('button',{name:'Peržiūrėti keleivių užklausas'})).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:/Tęsti kelionės kūrimą/}));
   expect(onPick).toHaveBeenLastCalledWith('driver',expect.objectContaining({fromLocation:'Trakai'}),true);
 });
 it('notifies completion once even when callback identity changes', async () => {
   const callback=vi.fn();
   const request={ ...mock.request, trip_id: trip.id, status: 'accepted', request_type: 'passenger_request' } as RideRequest;
   const view=render(<ChatDrawer trip={trip} request={request} userId="passenger" onClose={() => {}} onBothConfirmed={() => callback()} />);
   await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
   view.rerender(<ChatDrawer trip={trip} request={request} userId="passenger" onClose={() => {}} onBothConfirmed={() => callback()} />);
   await new Promise(resolve=>setTimeout(resolve,30));
   expect(callback).toHaveBeenCalledTimes(1);
 });
 it('explains that messages cannot be sent after a ride is cancelled', async () => {
   const cancelledRequest={
     ...mock.request,
     trip_id: trip.id,
     status: 'cancelled',
     request_type: 'passenger_request',
   } as RideRequest;
   mock.request = { ...mock.request, status: 'cancelled' };
   render(<ChatDrawer trip={trip} request={cancelledRequest} userId="passenger" onClose={() => {}} />);
   expect(await screen.findByText('Pokalbis uždarytas, nes kelionė buvo atšaukta.')).toBeTruthy();
   expect((screen.getByPlaceholderText('Žinučių siuntimas negalimas') as HTMLInputElement).disabled).toBe(true);
   mock.request = { ...mock.request, status: 'accepted' };
 });
 it('allows clearing the seat count before entering another value', () => {
   const view = render(<TripForm role="driver" userId="driver" onClose={() => {}} onSubmitted={() => {}} />);
   expect(document.body.style.overflow).toBe('hidden');
   const seats = screen.getByLabelText('Vietų skaičius') as HTMLInputElement;
   fireEvent.change(seats, { target: { value: '' } });
   expect(seats.value).toBe('');
   fireEvent.change(seats, { target: { value: '4' } });
   expect(seats.value).toBe('4');
   view.unmount();
   expect(document.body.style.overflow).toBe('');
 });

 it('prefills a best-match request from the passenger listing', () => {
   const passengerTrip = {
     ...trip,
     id: 'passenger-trip',
     role: 'passenger' as const,
     created_by: 'passenger',
     from_location: 'Trakai',
     to_location: 'Vilnius',
     name: 'Tester',
     phone: '+37060000000',
     seats: 2,
     baggage: 'Mažas',
   };
   render(<RequestModal trip={trip} passengerTrip={passengerTrip} userId="passenger" onClose={() => {}} onSubmitted={() => {}} />);
   expect(screen.getByText('Jūsų skelbimo duomenys užpildyti automatiškai')).toBeTruthy();
   expect(screen.getByText('Trakai → Vilnius')).toBeTruthy();
   expect(screen.queryByPlaceholderText('pvz. Vilnius, stotis')).toBeNull();
   expect(screen.getByPlaceholderText('Jei norite, parašykite vairuotojui žinutę')).toBeTruthy();
 });

 it('prefills a corridor request from the searched route', () => {
   render(<RequestModal
     trip={trip}
     initialRoute={{ from: { display_name: 'Šiauliai', lat: 55.9349, lng: 23.3137 }, to: { display_name: 'Kaunas', lat: 54.8985, lng: 23.9036 } }}
     userId="passenger"
     onClose={() => {}}
     onSubmitted={() => {}}
   />);
   expect(screen.getByDisplayValue('Šiauliai')).toBeTruthy();
   expect(screen.getByDisplayValue('Kaunas')).toBeTruthy();
   expect(screen.getByText(/užpildytos pagal jūsų paiešką/i)).toBeTruthy();
 });

 it('does not geocode while typing', async () => {
   const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>[]}); vi.stubGlobal('fetch',fetch);
   function Harness() { const [value,setValue]=useState<AddressValue>({display_name:'',lat:null,lng:null}); return <AddressInput value={value} onChange={setValue} placeholder="Address" />; }
   render(<Harness />);
   fireEvent.change(screen.getByPlaceholderText('Address'),{target:{value:'Vilnius'}});
   expect(fetch).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button',{name:'Ieškoti adreso'}));
   await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
 });

 it('applies filters only after confirming them', () => {
   const onChange = vi.fn();
   render(<FilterBar filters={emptyFilters} onChange={onChange} resultCount={3} />);
   fireEvent.click(screen.getByRole('button', { name: /filtruoti/i }));
   fireEvent.change(screen.getByPlaceholderText('pvz. Vilnius'), { target: { value: 'Šiauliai' } });
   expect(onChange).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button', { name: 'Rodyti rezultatus' }));
   expect(onChange).toHaveBeenCalledWith({ ...emptyFilters, fromLocation: 'Šiauliai' });
 });
});
