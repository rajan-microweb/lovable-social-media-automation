import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
} from "../_shared/encryption.ts";
import { getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Publish an X post (tweet).
 * Body:
 * - text: message
 *
 * Requires Authorization: Bearer <supabase_jwt>
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireAuthedUser(req);
    const body = await req.json();
    const text = body.text as string | undefined;

    if (!text) return jsonResponse(errorResponse("text is required"), 400);

    const supabase = getSupabaseServiceClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(supabase, user.id, "x");
    if (credError || !credentials) return jsonResponse(errorResponse(credError || "X integration not found"), 404);

    const accessToken = (credentials.access_token || (credentials as any).accessToken) as string | undefined;
    if (!accessToken) return jsonResponse(errorResponse("No access token found"), 400);

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    if (!res.ok || data?.errors) {
      return jsonResponse(errorResponse("Failed to publish X post"), 400);
    }

    return jsonResponse(successResponse({ id: data?.data?.id || null }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

