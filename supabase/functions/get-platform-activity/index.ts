import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============== AES-256-GCM Decryption ==============
async function decryptCredentials(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const [ivBase64, ciphertextBase64] = encryptedData.split(':');
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.includes(':') && value.length > 50;
}

async function safeDecryptCredentials(credentials: unknown, supabase: any): Promise<Record<string, unknown>> {
  if (typeof credentials === 'object' && credentials !== null && !Array.isArray(credentials)) {
    return credentials as Record<string, unknown>;
  }
  
  if (typeof credentials === 'string') {
    if (isEncrypted(credentials)) {
      try {
        const decrypted = await decryptCredentials(credentials);
        return JSON.parse(decrypted);
      } catch (aesError) {
        console.log('AES decryption failed, trying pgcrypto fallback');
        try {
          const { data: decrypted, error: decryptError } = await supabase
            .rpc('decrypt_credentials', { encrypted_creds: credentials });
          
          if (!decryptError && decrypted) {
            return typeof decrypted === 'object' ? decrypted : JSON.parse(decrypted);
          }
        } catch {
          console.error('Both decryption methods failed');
        }
      }
    }
    
    try {
      return JSON.parse(credentials);
    } catch {
      return {};
    }
  }
  
  return {};
}
// ====================================================

interface PlatformActivityItem {
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

type AnalyticsPlatformActivityRequest = {
  workspace_id?: string;
  platforms?: string[];
  date_from?: string; // ISO
  date_to?: string; // ISO
  max_age_seconds?: number;
  limit?: number;
  force?: boolean;
};

function parseMaybeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIsoOrDefault(value: unknown, fallback: Date): Date {
  return parseMaybeDate(value) ?? fallback;
}

function normalizePlatforms(platforms: unknown): string[] | undefined {
  if (!Array.isArray(platforms)) return undefined;
  const normalized = platforms
    .map((p) => (typeof p === "string" ? p.trim().toLowerCase() : null))
    .filter((p): p is string => Boolean(p));
  return normalized.length ? normalized : undefined;
}

function activityToSnapshotRow(
  workspaceId: string,
  sourceUserId: string,
  activity: PlatformActivityItem,
): Record<string, unknown> {
  const engagement = activity.engagement ?? {};

  return {
    workspace_id: workspaceId,
    user_id: sourceUserId,
    platform: activity.platform,
    account_id: activity.accountId,
    platform_content_id: activity.id,
    account_name: activity.accountName,
    content: activity.content ?? null,
    media_url: activity.mediaUrl ?? null,
    permalink: activity.permalink ?? null,
    published_at: new Date(activity.publishedAt).toISOString(),
    engagement_likes: engagement.likes ?? null,
    engagement_comments: engagement.comments ?? null,
    engagement_shares: engagement.shares ?? null,
    engagement_views: engagement.views ?? null,
    fetched_at: new Date().toISOString(),
  };
}

function snapshotRowToActivity(row: any): PlatformActivityItem {
  const engagementLikes = row.engagement_likes ?? null;
  const engagementComments = row.engagement_comments ?? null;
  const engagementShares = row.engagement_shares ?? null;
  const engagementViews = row.engagement_views ?? null;

  const hasAnyEngagement =
    engagementLikes !== null || engagementComments !== null || engagementShares !== null || engagementViews !== null;

  return {
    id: String(row.platform_content_id),
    platform: String(row.platform),
    accountName: String(row.account_name ?? ""),
    accountId: String(row.account_id ?? ""),
    content: String(row.content ?? ""),
    mediaUrl: row.media_url ?? undefined,
    permalink: row.permalink ?? undefined,
    publishedAt: new Date(row.published_at).toISOString(),
    engagement: hasAnyEngagement
      ? {
          likes: engagementLikes === null ? undefined : Number(engagementLikes),
          comments: engagementComments === null ? undefined : Number(engagementComments),
          shares: engagementShares === null ? undefined : Number(engagementShares),
          views: engagementViews === null ? undefined : Number(engagementViews),
        }
      : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let payload: AnalyticsPlatformActivityRequest = {};
    if (req.method === "POST") {
      try {
        payload = (await req.json()) as AnalyticsPlatformActivityRequest;
      } catch {
        payload = {};
      }
    } else {
      const url = new URL(req.url);
      const maxAgeSeconds = url.searchParams.get("max_age_seconds");
      const limit = url.searchParams.get("limit");
      payload = {
        workspace_id: url.searchParams.get("workspace_id") ?? undefined,
        platforms: url.searchParams.get("platforms")?.split(",") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        max_age_seconds: maxAgeSeconds ? Number(maxAgeSeconds) : undefined,
        limit: limit ? Number(limit) : undefined,
        force: url.searchParams.get("force") === "true",
      };
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      console.error("Auth error:", authError?.message || "No claims returned");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    // Use service role client for decryption + snapshot persistence
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const effectiveWorkspaceId = payload.workspace_id ?? user.id;
    const requestedPlatforms = normalizePlatforms(payload.platforms);
    const now = Date.now();
    const maxAgeSeconds = typeof payload.max_age_seconds === "number" ? payload.max_age_seconds : 3600;
    const force = Boolean(payload.force);
    const limit = typeof payload.limit === "number" ? payload.limit : 100;

    const fallbackFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = toIsoOrDefault(payload.date_from, fallbackFrom);
    const dateTo = toIsoOrDefault(payload.date_to, new Date(now));

    // -----------------------------
    // Cache: analytics snapshots
    // -----------------------------
    let snapshotQuery = supabase
      .from("analytics_platform_activity_snapshots")
      .select(
        "platform, account_id, platform_content_id, account_name, content, media_url, permalink, published_at, engagement_likes, engagement_comments, engagement_shares, engagement_views, fetched_at",
      )
      .eq("workspace_id", effectiveWorkspaceId)
      .gte("published_at", dateFrom.toISOString())
      .lte("published_at", dateTo.toISOString())
      .order("fetched_at", { ascending: false })
      .limit(limit);

    if (requestedPlatforms?.length) {
      snapshotQuery = snapshotQuery.in("platform", requestedPlatforms);
    }

    const { data: cachedSnapshots, error: cacheError } = await snapshotQuery;

    if (!force && !cacheError && cachedSnapshots?.length) {
      const newestFetchedAtMs = cachedSnapshots.reduce((max: number, row: any) => {
        const ms = new Date(row.fetched_at).getTime();
        return ms > max ? ms : max;
      }, 0);

      const isCacheFresh = newestFetchedAtMs >= now - maxAgeSeconds * 1000;

      if (isCacheFresh) {
        const cachedActivities = (cachedSnapshots || []).map(snapshotRowToActivity);
        const sortedActivities = cachedActivities
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, limit);

        return new Response(
          JSON.stringify({
            activities: sortedActivities,
            meta: {
              cached: true,
              latestSnapshotFetchedAt: newestFetchedAtMs
                ? new Date(newestFetchedAtMs).toISOString()
                : undefined,
              returnedCount: sortedActivities.length,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // -----------------------------
    // Live: fetch integrations
    // -----------------------------
    // For workspace analytics, include all workspace members.
    let memberUserIds = [user.id];
    if (payload.workspace_id) {
      // Ensure the requester is a member of the workspace.
      const { data: memberCheck, error: memberCheckError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", effectiveWorkspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberCheckError) throw memberCheckError;
      if (!memberCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", effectiveWorkspaceId);

      if (memberRowsError) throw memberRowsError;
      memberUserIds = (memberRows || []).map((r: any) => String(r.user_id));
      if (!memberUserIds.length) memberUserIds = [user.id];
    }

    let integrationsQuery = supabase
      .from("platform_integrations")
      .select("platform_name, credentials, credentials_encrypted, user_id")
      .in("user_id", memberUserIds)
      .eq("status", "active");

    if (requestedPlatforms?.length) {
      integrationsQuery = integrationsQuery.in("platform_name", requestedPlatforms);
    }

    const { data: integrations, error: intError } = await integrationsQuery;

    if (intError) {
      console.error("Failed to fetch integrations:", intError);
      throw intError;
    }

    const sourceActivities: Array<PlatformActivityItem & { _sourceUserId: string }> = [];

    // Process each platform in parallel
    const activityPromises = (integrations || []).map(async (integration) => {
      const platform = String(integration.platform_name).toLowerCase();
      const sourceUserId = String(integration.user_id);

      // Decrypt credentials using AES-GCM with pgcrypto fallback
      const credentials = await safeDecryptCredentials(integration.credentials, supabase);

      try {
        switch (platform) {
          case "linkedin":
            return (await fetchLinkedInActivity(credentials)).map((a) => ({ ...a, _sourceUserId: sourceUserId }));
          case "facebook":
            return (await fetchFacebookActivity(credentials)).map((a) => ({ ...a, _sourceUserId: sourceUserId }));
          case "instagram":
            return (await fetchInstagramActivity(credentials)).map((a) => ({ ...a, _sourceUserId: sourceUserId }));
          case "youtube":
            return (await fetchYouTubeActivity(credentials)).map((a) => ({ ...a, _sourceUserId: sourceUserId }));
          case "twitter":
            return (await fetchTwitterActivity(credentials)).map((a) => ({ ...a, _sourceUserId: sourceUserId }));
          default:
            return [] as Array<PlatformActivityItem & { _sourceUserId: string }>;
        }
      } catch (error) {
        console.error(`Failed to fetch ${platform} activity:`, error);
        return [] as Array<PlatformActivityItem & { _sourceUserId: string }>;
      }
    });

    const results = await Promise.allSettled(activityPromises);
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        sourceActivities.push(...(result.value || []));
      }
    });

    // Apply requested date window.
    const liveActivities = sourceActivities.filter((a) => {
      const ms = new Date(a.publishedAt).getTime();
      return ms >= dateFrom.getTime() && ms <= dateTo.getTime();
    });

    // Store snapshots (per content item + platform)
    const rowsToUpsert = liveActivities.map((a) =>
      activityToSnapshotRow(effectiveWorkspaceId, a._sourceUserId, a),
    );

    if (rowsToUpsert.length) {
      const { error: upsertError } = await supabase
        .from("analytics_platform_activity_snapshots")
        .upsert(rowsToUpsert, {
          onConflict: "workspace_id,user_id,platform,account_id,platform_content_id",
        });

      if (upsertError) {
        console.error("Failed to upsert analytics snapshots:", upsertError);
      }
    }

    const sortedActivities = liveActivities
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit)
      .map((a) => {
        const { _sourceUserId: _ignored, ...rest } = a;
        return rest;
      });

    return new Response(
      JSON.stringify({
        activities: sortedActivities,
        meta: {
          cached: false,
          latestSnapshotFetchedAt: new Date(now).toISOString(),
          returnedCount: sortedActivities.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in get-platform-activity:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchLinkedInActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const personalInfo = credentials?.personal_info;
  const companies = credentials?.company_info || [];

  // Fetch personal posts
  if (personalInfo?.linkedin_id) {
    try {
      const personUrn = personalInfo.linkedin_id.startsWith("urn:li:person:")
        ? personalInfo.linkedin_id
        : `urn:li:person:${personalInfo.linkedin_id}`;

      const response = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(personUrn)})&count=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.elements || [];
        posts.forEach((post: any) => {
          const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "";
          items.push({
            id: post.id,
            platform: "linkedin",
            accountName: personalInfo.name || "LinkedIn Personal",
            accountId: personUrn,
            content: text,
            permalink: `https://www.linkedin.com/feed/update/${post.id}`,
            publishedAt: new Date(post.created?.time || Date.now()).toISOString(),
          });
        });
      }
    } catch (e) {
      console.error("LinkedIn personal posts error:", e);
    }
  }

  // Fetch company posts
  for (const company of companies) {
    try {
      const orgUrn = company.company_id?.startsWith("urn:li:organization:")
        ? company.company_id
        : `urn:li:organization:${company.company_id}`;

      const response = await fetch(
        `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(orgUrn)})&count=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.elements || [];
        posts.forEach((post: any) => {
          const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "";
          items.push({
            id: post.id,
            platform: "linkedin",
            accountName: company.company_name || "LinkedIn Company",
            accountId: orgUrn,
            content: text,
            permalink: `https://www.linkedin.com/feed/update/${post.id}`,
            publishedAt: new Date(post.created?.time || Date.now()).toISOString(),
          });
        });
      }
    } catch (e) {
      console.error("LinkedIn company posts error:", e);
    }
  }

  return items;
}

async function fetchFacebookActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token || credentials?.page_access_token;
  if (!accessToken) return items;

  const pages = credentials?.pages || [];
  if (credentials?.page_id && !pages.length) {
    pages.push({ page_id: credentials.page_id, page_name: credentials.page_name || "Facebook Page" });
  }

  for (const page of pages) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${page.page_id}/feed?fields=id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=5&access_token=${accessToken}`
      );

      if (response.ok) {
        const data = await response.json();
        const posts = data.data || [];
        posts.forEach((post: any) => {
          items.push({
            id: post.id,
            platform: "facebook",
            accountName: page.page_name || "Facebook Page",
            accountId: page.page_id,
            content: post.message || "",
            permalink: post.permalink_url,
            publishedAt: post.created_time,
            engagement: {
              likes: post.likes?.summary?.total_count || 0,
              comments: post.comments?.summary?.total_count || 0,
              shares: post.shares?.count || 0,
            },
          });
        });
      }
    } catch (e) {
      console.error("Facebook page posts error:", e);
    }
  }

  return items;
}

async function fetchInstagramActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const accounts = credentials?.accounts || [];
  if (credentials?.ig_business_id && !accounts.length) {
    accounts.push({ ig_business_id: credentials.ig_business_id, ig_username: credentials.ig_username });
  }

  for (const account of accounts) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${account.ig_business_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=5&access_token=${accessToken}`
      );

      if (response.ok) {
        const data = await response.json();
        const media = data.data || [];
        media.forEach((item: any) => {
          items.push({
            id: item.id,
            platform: "instagram",
            accountName: `@${account.ig_username}` || "Instagram",
            accountId: account.ig_business_id,
            content: item.caption || "",
            mediaUrl: item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url,
            permalink: item.permalink,
            publishedAt: item.timestamp,
            engagement: {
              likes: item.like_count || 0,
              comments: item.comments_count || 0,
            },
          });
        });
      }
    } catch (e) {
      console.error("Instagram media error:", e);
    }
  }

  return items;
}

async function fetchYouTubeActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  if (!accessToken) return items;

  const channels = credentials?.channels || [];

  for (const channel of channels) {
    try {
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channel.channel_id}&access_token=${accessToken}`
      );

      if (!channelRes.ok) continue;

      const channelData = await channelRes.json();
      const uploadsPlaylist = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylist) continue;

      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=5&access_token=${accessToken}`
      );

      if (videosRes.ok) {
        const videosData = await videosRes.json();
        const videos = videosData.items || [];
        videos.forEach((video: any) => {
          const snippet = video.snippet;
          items.push({
            id: snippet.resourceId?.videoId || video.id,
            platform: "youtube",
            accountName: channel.channel_name || "YouTube Channel",
            accountId: channel.channel_id,
            content: snippet.title || "",
            mediaUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
            permalink: `https://www.youtube.com/watch?v=${snippet.resourceId?.videoId}`,
            publishedAt: snippet.publishedAt,
          });
        });
      }
    } catch (e) {
      console.error("YouTube videos error:", e);
    }
  }

  return items;
}

async function fetchTwitterActivity(credentials: any): Promise<PlatformActivityItem[]> {
  const items: PlatformActivityItem[] = [];
  const accessToken = credentials?.access_token;
  const userId = credentials?.personal_info?.user_id;
  if (!accessToken || !userId) return items;

  try {
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const tweets = data.data || [];
      tweets.forEach((tweet: any) => {
        items.push({
          id: tweet.id,
          platform: "twitter",
          accountName: credentials.personal_info?.name || `@${credentials.personal_info?.username}` || "Twitter",
          accountId: userId,
          content: tweet.text || "",
          permalink: `https://twitter.com/${credentials.personal_info?.username}/status/${tweet.id}`,
          publishedAt: tweet.created_at || new Date().toISOString(),
          engagement: {
            likes: tweet.public_metrics?.like_count || 0,
            comments: tweet.public_metrics?.reply_count || 0,
            shares: tweet.public_metrics?.retweet_count || 0,
          },
        });
      });
    }
  } catch (e) {
    console.error("Twitter tweets error:", e);
  }

  return items;
}
