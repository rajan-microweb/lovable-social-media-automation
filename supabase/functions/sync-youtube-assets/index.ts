import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
  updatePlatformMetadata,
} from "../_shared/encryption.ts";
import { getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Sync YouTube assets:
 * - channels for the authed user
 *
 * Requires Authorization: Bearer <supabase_jwt>
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await requireAuthedUser(req);
    const supabase = getSupabaseServiceClient();

    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user.id,
      "youtube",
    );
    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "YouTube integration not found"), 404);
    }

    const accessToken = (credentials.access_token || (credentials as any).accessToken) as string | undefined;
    if (!accessToken) return jsonResponse(errorResponse("No access token found"), 400);

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = await response.json();
    if (!response.ok || data?.error) {
      return jsonResponse(errorResponse(data?.error?.message || "Failed to fetch YouTube channels"), 400);
    }

    const channels = (data.items || []).map((channel: any) => ({
      channel_id: channel.id,
      channel_name: channel.snippet?.title || null,
      thumbnail_url: channel.snippet?.thumbnails?.default?.url || null,
      subscriber_count: channel.statistics?.subscriberCount || null,
      video_count: channel.statistics?.videoCount || null,
    }));

    await updatePlatformMetadata(supabase, integration.id, {
      ...(typeof integration.metadata === "object" && integration.metadata ? (integration.metadata as any) : {}),
      channels,
      synced_at: new Date().toISOString(),
    });

    return jsonResponse(successResponse({ channels }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

