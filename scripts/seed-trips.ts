import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Lithuanian coordinates for common locations
const LOCATIONS = {
  vilnius: { lat: 54.6872, lng: 25.2797 },
  kaunas: { lat: 54.8985, lng: 23.9036 },
  klaipeda: { lat: 55.7033, lng: 21.1443 },
  siauliai: { lat: 55.9346, lng: 23.3128 },
  panevezys: { lat: 55.7340, lng: 24.3575 },
  alytus: { lat: 54.3949, lng: 24.0458 },
  marijampole: { lat: 54.5572, lng: 23.3547 },
};

const TEST_TRIPS = [
  {
    role: 'driver',
    from_location: 'Vilnius, stotis',
    from_lat: LOCATIONS.vilnius.lat,
    from_lng: LOCATIONS.vilnius.lng,
    to_location: 'Kaunas, stotis',
    to_lat: LOCATIONS.kaunas.lat,
    to_lng: LOCATIONS.kaunas.lng,
    departure_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
    name: 'Petras',
    phone: '+37061234567',
    seats: 4,
    price: 15,
    price_unit: 'asmeniui',
    car_color: 'Juoda',
    car_make: 'Volkswagen',
    car_plate: 'ABC123',
    baggage: 'Nėra',
    notes: 'Važiuoju be sustojimų, galiu paimti prie stoties',
    is_recurring: false,
    status: 'active',
  },
  {
    role: 'driver',
    from_location: 'Vilnius, oro uostas',
    from_lat: 54.6383,
    from_lng: 25.2855,
    to_location: 'Klaipėda, jūrų uostas',
    to_lat: 55.7167,
    to_lng: 21.1167,
    departure_time: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours from now
    name: 'Jonas',
    phone: '+37062345678',
    seats: 3,
    price: 25,
    price_unit: 'asmeniui',
    car_color: 'Pilka',
    car_make: 'Audi',
    car_plate: 'DEF456',
    baggage: 'Vidutinis',
    notes: 'Galiu paimti bagažą, važiuoju per Kauną',
    is_recurring: false,
    status: 'active',
  },
  {
    role: 'passenger',
    from_location: 'Kaunas, Akademija',
    from_lat: 54.9333,
    from_lng: 23.9167,
    to_location: 'Vilnius, centras',
    to_lat: LOCATIONS.vilnius.lat,
    to_lng: LOCATIONS.vilnius.lng,
    departure_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
    name: 'Ona',
    phone: '+37063456789',
    seats: 2,
    price: null,
    price_unit: 'asmeniui',
    baggage: 'Mažas',
    notes: 'Važiuoju su vienu draugu, bagažas tik kuprinės',
    is_recurring: false,
    status: 'active',
  },
  {
    role: 'driver',
    from_location: 'Šiauliai, centras',
    from_lat: LOCATIONS.siauliai.lat,
    from_lng: LOCATIONS.siauliai.lng,
    to_location: 'Vilnius, stotis',
    to_lat: LOCATIONS.vilnius.lat,
    to_lng: LOCATIONS.vilnius.lng,
    departure_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    name: 'Antanas',
    phone: '+37064567890',
    seats: 4,
    price: 20,
    price_unit: 'asmeniui',
    car_color: 'Mėlyna',
    car_make: 'BMW',
    car_plate: 'GHI789',
    baggage: 'Didelis',
    notes: 'Komfortiabilus automobilis, galiu paimti daug bagažo',
    is_recurring: true,
    status: 'active',
  },
  {
    role: 'passenger',
    from_location: 'Panevėžys, stotis',
    from_lat: LOCATIONS.panevezys.lat,
    from_lng: LOCATIONS.panevezys.lng,
    to_location: 'Kaunas, stotis',
    to_lat: LOCATIONS.kaunas.lat,
    to_lng: LOCATIONS.kaunas.lng,
    departure_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
    name: 'Birutė',
    phone: '+37065678901',
    seats: 1,
    price: null,
    price_unit: 'asmeniui',
    baggage: null,
    notes: 'Ieškau patogios kelionės',
    is_recurring: false,
    status: 'active',
  },
  {
    role: 'driver',
    from_location: 'Klaipėda, centras',
    from_lat: LOCATIONS.klaipeda.lat,
    from_lng: LOCATIONS.klaipeda.lng,
    to_location: 'Palanga, oro uostas',
    to_lat: 55.9217,
    to_lng: 21.0694,
    departure_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
    name: 'Kazys',
    phone: '+37066789012',
    seats: 2,
    price: 10,
    price_unit: 'viso',
    car_color: 'Balta',
    car_make: 'Toyota',
    car_plate: 'JKL012',
    baggage: 'Mažas',
    notes: 'Trumpas maršrutas, galiu paimti prie centro',
    is_recurring: false,
    status: 'active',
  },
];

async function cleanAndSeed() {
  console.log('🗑️  Deleting all existing trips...');
  const { error: deleteError } = await supabase
    .from('trips')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (deleteError) {
    console.error('Error deleting trips:', deleteError);
  } else {
    console.log('✅ All trips deleted');
  }

  console.log('🗑️  Deleting all existing ride requests...');
  const { error: deleteRequestsError } = await supabase
    .from('ride_requests')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteRequestsError) {
    console.error('Error deleting requests:', deleteRequestsError);
  } else {
    console.log('✅ All ride requests deleted');
  }

  console.log('📝 Inserting new test trips...');
  
  for (const trip of TEST_TRIPS) {
    const { error } = await supabase.from('trips').insert(trip);
    if (error) {
      console.error(`❌ Error inserting trip ${trip.from_location} → ${trip.to_location}:`, error);
    } else {
      console.log(`✅ Inserted: ${trip.from_location} → ${trip.to_location}`);
    }
  }

  console.log('🎉 Seeding complete!');
}

cleanAndSeed().catch(console.error);
