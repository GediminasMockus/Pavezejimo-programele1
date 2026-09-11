export type MatchStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

export interface Match {
  id: string;
  driver_trip_id: string;
  passenger_trip_id: string | null;
  request_id: string | null;
  driver_id: string | null;
  passenger_id: string | null;
  status: MatchStatus;
  match_score: number | null;
  route_overlap_pct: number | null;
  detour_pct: number | null;
  pickup_detour_km: number | null;
  dropoff_detour_km: number | null;
  driver_confirmed: boolean;
  passenger_confirmed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function matchParticipantId(match: Match, userId: string): string | null {
  if (match.driver_id === userId) return match.passenger_id;
  if (match.passenger_id === userId) return match.driver_id;
  return null;
}
