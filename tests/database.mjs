import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
`);
const migrations=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
assert.equal(new Set(migrations.map(f=>f.split('_')[0])).size,migrations.length,'duplicate migration versions');
for(const file of migrations) {
 try { await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8')); }
 catch(error) { console.error('Migration failed:',file,error.message); await db.close(); process.exit(1); }
}
console.log('All '+migrations.length+' migrations replayed successfully.');

const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
for(const id of ids) await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,id+'@test.invalid']);
async function asUser(id,fn) {
 await db.exec('BEGIN; SET LOCAL ROLE authenticated');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
 try { const result=await fn(); await db.exec('COMMIT'); return result; }
 catch(error) { await db.exec('ROLLBACK'); throw error; }
}
const query=(sql,args=[])=>db.query(sql,args);
const rpc=(name,args)=>query('SELECT * FROM public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args).then(r=>r.rows[0]);
const payload=(role,seats=2)=>({role,seats,from_location:'Private street 123',to_location:'Private street 456',from_area:'Vilnius',to_area:'Kaunas',from_lat:54.687123,from_lng:25.279876,to_lat:54.898543,to_lng:23.903678,departure_time:new Date(Date.now()+7200000).toISOString(),name:'Test',car_make:'Test',car_color:'Blue',car_plate:'TEST01',phone:'+37061234567'});
const trip=await asUser(ids[0],()=>rpc('create_my_trip',[payload('driver')]));
assert.equal(trip.created_by,ids[0]);
await asUser(ids[1],async()=>{
 const publicTrip=(await query('SELECT * FROM public.public_trips WHERE id=$1',[trip.id])).rows[0];
 assert.equal(publicTrip.from_location,'Vilnius'); assert.equal(publicTrip.phone,null);
 assert.equal(publicTrip.from_lat,54.69); assert.equal(publicTrip.available_seats,2);
 assert.equal((await query('SELECT * FROM public.trips WHERE id=$1',[trip.id])).rows.length,0);
});
await assert.rejects(asUser(ids[1],()=>query('UPDATE public.user_profiles SET is_admin=true WHERE id=$1',[ids[1]])),/permission denied/);
await assert.rejects(asUser(ids[1],()=>rpc('update_my_trip',[trip.id,payload('driver')])),/not authorized/);
async function request(user,tripId,seats=1) {
 return asUser(user,async()=> (await query("INSERT INTO public.ride_requests(trip_id,passenger_id,passenger_name,pickup_location,dropoff_location,seats_needed) VALUES($1,$2,'Passenger','Pickup','Dropoff',$3) RETURNING *",[tripId,user,seats])).rows[0]);
}
const r1=await request(ids[1],trip.id,2),r2=await request(ids[2],trip.id,1);
await asUser(ids[0],()=>rpc('set_ride_request_status',[r1.id,'accepted',null]));
await assert.rejects(asUser(ids[0],()=>rpc('set_ride_request_status',[r2.id,'accepted',null])),/not enough seats/);
await assert.rejects(asUser(ids[3],()=>rpc('set_ride_request_status',[r1.id,'cancelled',null])),/not authorized/);
await asUser(ids[1],async()=>{
 assert.equal((await query('SELECT * FROM public.get_accessible_trips() WHERE id=$1',[trip.id])).rows[0].phone,'+37061234567');
});
await asUser(ids[0],()=>rpc('set_ride_request_status',[r1.id,'cancelled',null]));
await asUser(ids[0],()=>rpc('set_ride_request_status',[r2.id,'accepted',null]));
await assert.rejects(asUser(ids[0],()=>rpc('set_ride_request_status',[r1.id,'accepted',null])),/closed/);
await asUser(ids[3],async()=>assert.equal((await query('SELECT * FROM public.ride_requests')).rows.length,0));
await assert.rejects(asUser(ids[2],()=>query("UPDATE public.ride_requests SET seats_needed=8 WHERE id=$1",[r2.id])),/permission denied/);
const passengerTrip=await asUser(ids[1],()=>rpc('create_my_trip',[payload('passenger',2)]));
const driverTrip=await asUser(ids[0],()=>rpc('create_my_trip',[payload('driver',3)]));
const offer=await asUser(ids[0],async()=> (await query("INSERT INTO public.ride_requests(trip_id,driver_trip_id,driver_id,passenger_id,passenger_name,pickup_location,dropoff_location,request_type,seats_needed) VALUES($1,$2,$3,$4,'Passenger','Pickup','Dropoff','driver_offer',1) RETURNING *",[passengerTrip.id,driverTrip.id,ids[0],ids[1]])).rows[0]);
assert.equal(offer.seats_needed,2,'server uses passenger party size');
await assert.rejects(asUser(ids[0],()=>rpc('set_ride_request_status',[offer.id,'accepted',null])),/not authorized/);
await asUser(ids[1],()=>rpc('set_ride_request_status',[offer.id,'accepted',null]));
const match=(await query('SELECT * FROM public.matches WHERE request_id=$1',[offer.id])).rows[0];
await asUser(ids[1],()=>query("INSERT INTO public.messages(trip_id,request_id,match_id,author_id,author_name,body) VALUES($1,$2,$3,$4,'Passenger','Hello')",[driverTrip.id,offer.id,match.id,ids[1]]));
await assert.rejects(asUser(ids[3],()=>query("INSERT INTO public.messages(trip_id,request_id,match_id,author_id,author_name,body) VALUES($1,$2,$3,$4,'Intruder','Hello')",[driverTrip.id,offer.id,match.id,ids[3]])),/row-level security/);
await assert.rejects(asUser(ids[1],()=>rpc('confirm_ride',[offer.id])),/not started/);
await query("UPDATE public.trips SET departure_time=now()-interval '1 hour' WHERE id IN ($1,$2)",[driverTrip.id,passengerTrip.id]);
await asUser(ids[1],()=>rpc('confirm_ride',[offer.id]));
await asUser(ids[0],()=>rpc('confirm_ride',[offer.id]));
assert.equal((await query('SELECT status FROM public.matches WHERE id=$1',[match.id])).rows[0].status,'completed');
await asUser(ids[1],async()=>assert.ok((await query('SELECT * FROM public.get_accessible_trips()')).rows.some(t=>t.id===driverTrip.id)));
await assert.rejects(asUser(ids[1],()=>rpc('set_ride_request_status',[offer.id,'cancelled',null])),/immutable/);
await asUser(ids[1],()=>rpc('submit_rating',[driverTrip.id,ids[0],'driver',5,'Great',offer.id,match.id]));
await assert.rejects(asUser(ids[1],()=>rpc('submit_rating',[driverTrip.id,ids[0],'driver',4,null,offer.id,match.id])),/already submitted/);
await assert.rejects(asUser(ids[3],()=>rpc('submit_rating',[driverTrip.id,ids[0],'driver',5,null,offer.id,match.id])),/not authorized/);
await asUser(ids[0],()=>rpc('submit_rating',[driverTrip.id,ids[1],'passenger',4,null,offer.id,match.id]));
await asUser(ids[2],async()=>{
 assert.equal((await query('SELECT public.claim_geocode() AS allowed')).rows[0].allowed,true);
 assert.equal((await query('SELECT public.claim_geocode() AS allowed')).rows[0].allowed,false);
});
console.log('Booking, capacity, authorization, privacy, chat, history, completion, rating and geocoder tests passed.');

await db.close();
