import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
} from "../_shared/encryption.ts";
import { getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Publish a Facebook Page post.
 * Body:
 * - target_id: page_id
 * - text: message
 * - media_url?: optional image URL (publicly accessible)
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
    const media_url = body.media_url as string | undefined;

    if (!target_id) return jsonResponse(errorResponse("target_id is required"), 400);
    if (!text && !media_url) return jsonResponse(errorResponse("text or media_url is required"), 400);

    const supabase = getSupabaseServiceClient();

    // Credentials are stored under the facebook integration
    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user.id,
      "facebook",
    );
    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "Facebook integration not found"), 404);
    }

    const pageTokens = (credentials as any).page_tokens as Record<string, string> | undefined;
    const meta = integration.metadata as any;
    const pageName = Array.isArray(meta?.pages) ? meta.pages.find((p: any) => p.page_id === target_id)?.page_name : null;
    const pageToken = (pageTokens && (pageTokens[target_id] || (pageName ? pageTokens[pageName] : undefined))) as
      | string
      | undefined;

    if (!pageToken) return jsonResponse(errorResponse("No page token found. Run sync-meta-assets."), 400);

    // If media_url present, publish as photo post; else feed post
    if (media_url) {
      const res = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(target_id)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          url: media_url,
          caption: text || "",
          access_token: pageToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        return jsonResponse(errorResponse(data?.error?.message || "Failed to publish photo"), 400);
      }
      return jsonResponse(successResponse({ id: data.id }));
    }

    const res = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(target_id)}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        message: text || "",
        access_token: pageToken,
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      return jsonResponse(errorResponse(data?.error?.message || "Failed to publish post"), 400);
    }

    return jsonResponse(successResponse({ id: data.id }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

