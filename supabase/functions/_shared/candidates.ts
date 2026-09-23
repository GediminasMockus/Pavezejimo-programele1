// Scan every API page before choosing the bounded set sent to the routing provider.
export async function rankCandidates<T extends { id: string }>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  eligible: (candidate: T) => boolean,
  distance: (candidate: T) => number,
  limit: number,
): Promise<T[]> {
  const pageSize = 100;
  let ranked: { candidate: T; distance: number }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await page(offset, offset + pageSize - 1);
    if (error) throw error;
    ranked = ranked.concat((data ?? []).filter(eligible).map(candidate => ({ candidate, distance: distance(candidate) })))
      .sort((a, b) => a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, limit);
    if (!data || data.length < pageSize) return ranked.map(item => item.candidate);
  }
}
