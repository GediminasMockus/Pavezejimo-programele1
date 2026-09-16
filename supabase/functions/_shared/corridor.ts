export type CorridorMetrics = {
  pickupDistanceKm: number;
  dropoffDistanceKm: number;
  pickupProgress: number;
  dropoffProgress: number;
  detourKm: number;
  detourPct: number;
  passageTimeDifferenceMinutes: number | null;
  seatsAvailable: number;
  seatsNeeded: number;
};

export type CorridorEvaluation = CorridorMetrics & {
  qualifies: boolean;
  score: number;
  reasons: string[];
};

export const CORRIDOR_LIMITS = {
  preferredDistanceToRouteKm: 15,
  maxDetourKm: 45,
  maxDetourPct: 20,
  maxPassageTimeDifferenceMinutes: 90,
  minimumProgressGap: 0.01,
} as const;

export function evaluateCorridor(metrics: CorridorMetrics): CorridorEvaluation {
  const correctDirection = metrics.dropoffProgress - metrics.pickupProgress >= CORRIDOR_LIMITS.minimumProgressGap;
  const timeFits = metrics.passageTimeDifferenceMinutes == null
    || metrics.passageTimeDifferenceMinutes <= CORRIDOR_LIMITS.maxPassageTimeDifferenceMinutes;
  const seatsFit = metrics.seatsAvailable >= metrics.seatsNeeded;
  const followsExistingCorridor = metrics.pickupDistanceKm <= CORRIDOR_LIMITS.preferredDistanceToRouteKm
    && metrics.dropoffDistanceKm <= CORRIDOR_LIMITS.preferredDistanceToRouteKm;
  const practicalDetour = metrics.detourKm <= CORRIDOR_LIMITS.maxDetourKm
    && metrics.detourPct <= CORRIDOR_LIMITS.maxDetourPct;
  const qualifies = (followsExistingCorridor || practicalDetour)
    && correctDirection
    && timeFits
    && seatsFit;

  const reasons: string[] = [];
  if (metrics.pickupDistanceKm <= 5 && metrics.dropoffDistanceKm <= 5) reasons.push('Abi vietos beveik prie vairuotojo kelio');
  else if (metrics.pickupDistanceKm <= CORRIDOR_LIMITS.preferredDistanceToRouteKm && metrics.dropoffDistanceKm <= CORRIDOR_LIMITS.preferredDistanceToRouteKm) reasons.push('Abi vietos iki 15 km nuo vairuotojo kelio');
  if (correctDirection) reasons.push('Tinkama važiavimo kryptis');
  if (metrics.detourPct <= 10) reasons.push('Nedidelis papildomas apvažiavimas');
  else if (metrics.detourPct <= 20) reasons.push('Priimtinas papildomas apvažiavimas');
  if (timeFits && metrics.passageTimeDifferenceMinutes != null) reasons.push('Tinkamas pravažiavimo laikas');
  if (seatsFit) reasons.push('Pakanka vietų');

  const proximityPenalty = Math.min(10, (metrics.pickupDistanceKm + metrics.dropoffDistanceKm) / 15);
  const detourPenalty = metrics.detourPct * 1.5 + metrics.detourKm * 0.5;
  const timePenalty = (metrics.passageTimeDifferenceMinutes ?? 0) / 9;
  const score = Math.round(Math.max(0, Math.min(100, 100 - proximityPenalty - detourPenalty - timePenalty)));

  return { ...metrics, qualifies, score, reasons: reasons.slice(0, 4) };
}
