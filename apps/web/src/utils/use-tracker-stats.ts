"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTrackerStats, type TrackerStatsResponse } from "@/utils/tracker-api";

/**
 * Cached client access to the tracker-stats API, shared by every merchant
 * page (dashboard / orders / customers / sales).
 *
 * All consumers mount the same query key for a given site, so navigating
 * between merchant pages serves the in-memory TanStack cache instead of
 * re-fetching from the network. The 5-minute staleTime (global QueryClient
 * default) matches the server-side revalidate window of /api/tracker/stats,
 * so client and server caches expire together. On page mounts where the data
 * has gone stale we refetch in the background (refetchOnMount) so returning
 * to a dashboard still refreshes, but never more often than every 5 minutes.
 */
export function useTrackerStats(siteId: string, enabled: boolean) {
  return useQuery<TrackerStatsResponse>({
    queryKey: ["tracker-stats", siteId || "all"],
    queryFn: () => fetchTrackerStats(siteId || ""),
    enabled: enabled && Boolean(siteId),
    refetchOnMount: true,
  });
}
