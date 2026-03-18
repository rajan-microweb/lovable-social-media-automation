import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
} from "../_shared/encryption.ts";
import { getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Publish a LinkedIn post (member or organization).
 * Body:
 * - target_id: urn:li:person:... OR urn:li:organization:...
 * - text: message
 *
 * Requires Authorization: Bearer <supabase_jwt>
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireAuthedUser(req);
    const body = await req.json();
    const target_id = body.target_id as string | undefined;
    const text = body.text as string | undefined;

    if (!target_id) return jsonResponse(errorResponse("target_id is required"), 400);
    if (!text) return jsonResponse(errorResponse("text is required"), 400);

    const supabase = getSupabaseServiceClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(supabase, user.id, "linkedin");
    if (credError || !credentials) return jsonResponse(errorResponse(credError || "LinkedIn integration not found"), 404);

    const accessToken = (credentials.access_token || (credentials as any).accessToken) as string | undefined;
    if (!accessToken) return jsonResponse(errorResponse("No access token found"), 400);

    const author = target_id.startsWith("urn:li:")
      ? target_id
      : target_id.includes("organization")
        ? `urn:li:organization:${target_id}`
        : `urn:li:person:${target_id}`;

    const payload = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse(errorResponse(`LinkedIn publish failed: ${errText}`), 400);
    }

    const location = res.headers.get("x-restli-id") || res.headers.get("location");
    return jsonResponse(successResponse({ id: location || "created" }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

