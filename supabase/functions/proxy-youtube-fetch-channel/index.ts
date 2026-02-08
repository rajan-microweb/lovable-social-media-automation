import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    // Parse request
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse(errorResponse("Missing user_id"), 400);
    }

    // Get decrypted credentials
    const supabase = createSupabaseClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "youtube"
    );

    if (credError || !credentials) {
      return jsonResponse(errorResponse(credError || "YouTube integration not found"), 404);
    }

    const accessToken = credentials.access_token as string;
    if (!accessToken) {
      return jsonResponse(errorResponse("No access token found"), 400);
    }

    // Fetch channel info
    console.log("[youtube] Fetching channel info...");
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      console.error("[youtube] API error:", data.error.message);
      return jsonResponse(errorResponse(data.error.message), 400);
    }

    const channels = (data.items || []).map((channel: {
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        thumbnails?: { default?: { url?: string } };
      };
      statistics?: {
        subscriberCount?: string;
        videoCount?: string;
      };
      contentDetails?: {
        relatedPlaylists?: { uploads?: string };
      };
    }) => ({
      channel_id: channel.id,
      channel_name: channel.snippet?.title || null,
      description: channel.snippet?.description || null,
      thumbnail_url: channel.snippet?.thumbnails?.default?.url || null,
      subscriber_count: channel.statistics?.subscriberCount || null,
      video_count: channel.statistics?.videoCount || null,
      uploads_playlist_id: channel.contentDetails?.relatedPlaylists?.uploads || null,
    }));

    console.log(`[youtube] Found ${channels.length} channels`);

    return jsonResponse(successResponse({ channels }));
  } catch (error) {
    console.error("Error in proxy-youtube-fetch-channel:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
