import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read .env file directly
const envPath = resolve(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

console.log('Debug: All environment variables in .env:');
Object.keys(envVars).forEach(key => {
  console.log(`  ${key}: ${key.includes('KEY') || key.includes('SECRET') ? '***hidden***' : envVars[key]}`);
});
console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✓ present' : '✗ missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓ present' : '✗ missing');

if (!supabaseUrl) {
  console.error('❌ Missing VITE_SUPABASE_URL in .env file');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env file');
  console.error('Please add it to your .env file:');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here');
  console.error('\nYou can get it from Supabase Dashboard → Project Settings → API → service_role (secret)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Applying ride request fix migration...\n');

  const sql = `
-- Fix ride request insert policy to restore business logic validation
-- The admin migration (20260828075000) replaced insert_ride_requests_v2 with a simpler policy
-- that removed all business logic checks, causing passenger requests to fail.

-- Drop the overly permissive policy from the admin migration
DROP POLICY IF EXISTS "insert_ride_requests_auth" ON public.ride_requests;

-- Restore the comprehensive insert policy with business logic validation
-- while preserving admin override capability
CREATE POLICY "insert_ride_requests_v3" ON public.ride_requests
FOR INSERT TO authenticated
WITH CHECK (
  (
    request_type = 'passenger_request'
    AND passenger_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = ride_requests.trip_id
        AND t.role = 'driver'
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND t.departure_time > now()
        AND t.created_by <> auth.uid()::text
    )
  )
  OR
  (
    request_type = 'driver_offer'
    AND driver_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips passenger_trip
      WHERE passenger_trip.id = ride_requests.trip_id
        AND passenger_trip.role = 'passenger'
        AND passenger_trip.status = 'active'
        AND passenger_trip.deleted_at IS NULL
        AND passenger_trip.departure_time > now()
        AND passenger_trip.created_by = ride_requests.passenger_id
        AND passenger_trip.created_by <> auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM public.trips driver_trip
      WHERE driver_trip.id = ride_requests.driver_trip_id
        AND driver_trip.role = 'driver'
        AND driver_trip.created_by = auth.uid()::text
        AND driver_trip.status = 'active'
        AND driver_trip.deleted_at IS NULL
        AND driver_trip.departure_time > now()
    )
  )
  OR
  (
    -- Admin override: admins can insert any request
    (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text) = true
  )
);
`;

  try {
    // Use the Supabase REST API to execute SQL via the /sql endpoint
    console.log('📡 Sending SQL to Supabase...');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        query: sql
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    console.log('✅ Migration applied successfully!');
    console.log('\nThe ride request insert policy has been restored with full business logic validation.');
    console.log('Passengers should now be able to send requests to drivers.');
  } catch (error) {
    console.error('❌ Failed to apply migration:', error.message);
    console.error('\nPlease run the SQL manually in Supabase Dashboard → SQL Editor:');
    console.error('File: supabase/migrations/20260828140000_fix_ride_request_insert_policy.sql');
    process.exit(1);
  }
}

applyMigration();
