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
 * Sync X assets:
 * - authenticated user profile (id/username/name/profile_image_url)
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

    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(supabase, user.id, "x");
    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "X integration not found"), 404);
    }

    const accessToken = (credentials.access_token || (credentials as any).accessToken) as string | undefined;
    if (!accessToken) return jsonResponse(errorResponse("No access token found"), 400);

    const response = await fetch("https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();
    if (!response.ok || data?.errors) {
      return jsonResponse(errorResponse("Failed to fetch X user"), 400);
    }

    const userInfo = {
      id: data?.data?.id || null,
      username: data?.data?.username || null,
      name: data?.data?.name || null,
      profile_image_url: data?.data?.profile_image_url || null,
    };

    await updatePlatformMetadata(supabase, integration.id, {
      ...(typeof integration.metadata === "object" && integration.metadata ? (integration.metadata as any) : {}),
      user: userInfo,
      synced_at: new Date().toISOString(),
    });

    return jsonResponse(successResponse({ user: userInfo }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

