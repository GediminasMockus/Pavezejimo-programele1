import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { withRetry } from '../src/lib/retry';
import { fetchAllRows } from '../src/lib/pagination';
import { mapPopup } from '../src/lib/mapPopup';
import { navigationUrl } from '../src/lib/navigation';
import { applyFilters, emptyFilters, findBestMatches } from '../src/lib/tripFilters';
import { HomeScreen } from '../src/components/HomeScreen';
import { ChatDrawer } from '../src/components/ChatDrawer';
import { AddressInput, type AddressValue } from '../src/components/AddressInput';
import type { Trip, RideRequest } from '../src/lib/supabase';
const mock = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(),
  request: { id: 'request', passenger_id: 'passenger', driver_confirmed: true, passenger_confirmed: true },
}));
vi.mock('../src/lib/supabase', () => {
 const result = (data: unknown) => {
   const chain: Record<string, unknown> = {};
   for (const name of ['select','eq','order','limit','single','maybeSingle']) chain[name] = () => chain;
   chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null, count: 0 }).then(resolve);
   return chain;
 };
 const channel = { on: () => channel, subscribe: () => channel };
 mock.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'get_my_matches' ? [{ id: 'match', request_id: 'request' }] : [{ display_name: 'Tester', is_admin: false }], error: null }));
 mock.from.mockImplementation((name: string) => result(name === 'ride_requests' ? mock.request : []));
 return { supabase: { rpc: mock.rpc, from: mock.from, channel: () => channel, removeChannel: vi.fn(),
   auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } } }) } } };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const trip = { id: 'trip', role: 'driver', status: 'active', created_by: 'driver', seats: 2, available_seats: 2,
 from_location: 'Vilnius', to_location: 'Kaunas', from_lat: 54.68, from_lng: 25.27, to_lat: 54.89, to_lng: 23.9,
 departure_time: '2030-09-12T12:00:00Z', price: 10, price_unit: 'asmeniui', name: 'Driver' } as Trip;
describe('data helpers', () => {
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
});
describe('user workflows', () => {
 it('passes the entered route to search and creation', async () => {
   const onPick=vi.fn();
   render(<HomeScreen userId="passenger" onPick={onPick} onSignOut={() => {}} />);
   fireEvent.change(screen.getByPlaceholderText('Vilnius'),{ target: { value: 'Trakai' } });
   fireEvent.change(screen.getByPlaceholderText('Kaunas'),{ target: { value: 'Vilnius' } });
   fireEvent.click(screen.getByRole('button',{name:/Rasti kelionę/}));
   expect(onPick).toHaveBeenLastCalledWith('passenger',expect.objectContaining({fromLocation:'Trakai',toLocation:'Vilnius'}),false);
   fireEvent.click(screen.getByRole('button',{name:'Vežu'}));
   fireEvent.click(screen.getByRole('button',{name:/Paskelbti kelionę/}));
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
 it('does not geocode while typing', async () => {
   const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>[]}); vi.stubGlobal('fetch',fetch);
   function Harness() { const [value,setValue]=useState<AddressValue>({display_name:'',lat:null,lng:null}); return <AddressInput value={value} onChange={setValue} placeholder="Address" />; }
   render(<Harness />);
   fireEvent.change(screen.getByPlaceholderText('Address'),{target:{value:'Vilnius'}});
   expect(fetch).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button',{name:'Ieškoti adreso'}));
   await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
 });
});
