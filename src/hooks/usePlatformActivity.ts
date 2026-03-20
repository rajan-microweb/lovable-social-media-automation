import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlatformActivityItem {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  content: string;
  mediaUrl?: string;
  permalink?: string;
  publishedAt: string;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
}

export interface PlatformActivityCacheInfo {
  cached: boolean;
  latestSnapshotFetchedAt?: string;
  returnedCount?: number;
}

export interface UsePlatformActivityOptions {
  userId?: string;
  workspaceId?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  platforms?: string[];
  maxAgeSeconds?: number;
}

export function usePlatformActivity(options: UsePlatformActivityOptions) {
  const [activities, setActivities] = useState<PlatformActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<PlatformActivityCacheInfo>({
    cached: false,
  });

  const fetchActivity = async (force: boolean): Promise<{ ok: boolean }> => {
    if (!options.userId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-platform-activity", {
        body: {
          workspace_id: options.workspaceId,
          date_from: options.dateFrom,
          date_to: options.dateTo,
          platforms: options.platforms,
          max_age_seconds: options.maxAgeSeconds ?? 3600,
          force,
        },
      });

      if (fnError) throw fnError;

      setActivities(data?.activities || []);
      setCacheInfo({
        cached: Boolean(data?.meta?.cached),
        latestSnapshotFetchedAt: data?.meta?.latestSnapshotFetchedAt,
        returnedCount: data?.meta?.returnedCount,
      });
      return { ok: true };
    } catch (err) {
      console.error("Failed to fetch platform activity:", err);
      setError("Failed to load platform activity");
      // Don't show toast for auth errors since user might not have connected platforms
      return { ok: false };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!options.userId) {
      setActivities([]);
      setCacheInfo({ cached: false });
      return;
    }

    fetchActivity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.userId,
    options.workspaceId,
    options.dateFrom,
    options.dateTo,
    JSON.stringify(options.platforms ?? []),
    options.maxAgeSeconds,
  ]);

  const refresh = async (opts?: { force?: boolean }) => {
    try {
      const res = await fetchActivity(Boolean(opts?.force));
      if (res.ok && opts?.force) toast.success("Analytics refreshed");
      if (!res.ok) toast.error("Failed to refresh activity");
    } catch (e) {
      console.error("Failed to refresh platform activity:", e);
      toast.error("Failed to refresh activity");
    }
  };

  return { activities, loading, error, refresh, cacheInfo };
}
