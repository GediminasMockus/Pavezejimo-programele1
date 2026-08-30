import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type TripRole = 'driver' | 'passenger';
export type PriceUnit = 'asmeniui' | 'viso';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type TripStatus = 'active' | 'completed';
export type NotificationType = 'request_accepted' | 'request_rejected' | 'trip_reminder' | 'new_message';

export interface Trip {
  id: string;
  role: TripRole;
  from_location: string;
  to_location: string;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  departure_time: string;
  name: string;
  phone: string | null;
  seats: number;
  price: number | null;
  price_unit: PriceUnit;
  car_color: string | null;
  car_make: string | null;
  car_plate: string | null;
  baggage: string | null;
  notes: string | null;
  deleted_at: string | null;
  deletion_reason: string | null;
  created_by: string | null;
  is_recurring: boolean;
  status: TripStatus;
  completed_at: string | null;
  created_at: string;
}

export interface NewTrip {
  role: TripRole;
  from_location: string;
  to_location: string;
  from_lat?: number | null;
  from_lng?: number | null;
  to_lat?: number | null;
  to_lng?: number | null;
  departure_time: string;
  name: string;
  phone?: string;
  seats: number;
  price?: number | null;
  price_unit?: PriceUnit;
  car_color?: string | null;
  car_make?: string | null;
  car_plate?: string | null;
  baggage?: string | null;
  notes?: string;
  created_by?: string;
  is_recurring?: boolean;
}

export interface RideRequest {
  id: string;
  trip_id: string;
  passenger_name: string;
  passenger_phone: string | null;
  passenger_id: string;
  pickup_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_location: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  seats_needed: number;
  baggage: string | null;
  notes: string | null;
  status: RequestStatus;
  driver_message: string | null;
  passenger_confirmed: boolean;
  driver_confirmed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  request_type: 'passenger_request' | 'driver_offer';
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_trip_id: string | null;
}

export interface NewRideRequest {
  trip_id: string;
  passenger_name: string;
  passenger_phone?: string;
  passenger_id: string;
  pickup_location: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_location: string;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  seats_needed: number;
  baggage?: string | null;
  notes?: string;
  request_type?: 'passenger_request' | 'driver_offer';
  driver_id?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_trip_id?: string | null;
}

export interface UserProfile {
  id: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  phone: string | null;
  default_role: TripRole | null;
  total_ratings: number;
  avg_rating: number;
  created_at: string;
}

export interface Rating {
  id: string;
  rater_id: string;
  rated_id: string;
  trip_id: string | null;
  role: TripRole;
  score: number;
  comment: string | null;
  created_at: string;
}

export interface NewRating {
  rater_id: string;
  rated_id: string;
  trip_id?: string | null;
  role: TripRole;
  score: number;
  comment?: string;
}

export interface Message {
  id: string;
  trip_id: string;
  request_id: string | null;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface NewMessage {
  trip_id: string;
  request_id?: string | null;
  author_id: string;
  author_name: string;
  body: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_trip_id: string | null;
  related_request_id: string | null;
  read: boolean;
  created_at: string;
}
