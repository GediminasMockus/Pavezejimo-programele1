const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanAndSeed() {
  console.log('🗑️  Deleting all existing trips...');
  const { error: deleteError } = await supabase
    .from('trips')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

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

  console.log('📝 Inserting new test trips via RPC...');
  
  const { data, error } = await supabase.rpc('admin_seed_test_trips');
  
  if (error) {
    console.error('❌ Error seeding trips via RPC:', error);
    console.log('⚠️  Please run the SQL migration manually in Supabase dashboard:');
    console.log('   File: supabase/migrations/20260828074300_seed_test_trips.sql');
  } else {
    console.log('✅ Trips seeded successfully via RPC');
  }
}

cleanAndSeed().catch(console.error);
