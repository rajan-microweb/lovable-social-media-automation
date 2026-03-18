import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
} from "../_shared/encryption.ts";
import { getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Publish an Instagram post via IG Content Publishing API (Professional accounts only).
 * Body:
 * - target_id: ig_business_id
 * - text?: caption
 * - media_url: public image URL (VIDEO support can be added later)
 *
 * Requires Authorization: Bearer <supabase_jwt>
 */

function findConnectedPageToken(args: {
  igTargetId: string;
  igMetadata: any;
  pageTokens?: Record<string, string>;
}): string | null {
  const { igTargetId, igMetadata, pageTokens } = args;
  if (!pageTokens) return null;
  const account = Array.isArray(igMetadata?.accounts)
    ? igMetadata.accounts.find((a: any) => a.ig_business_id === igTargetId)
    : null;
  const pageId = account?.connected_page_id as string | undefined;
  const pageName = account?.connected_page_name as string | undefined;
  return (pageId && pageTokens[pageId]) || (pageName && pageTokens[pageName]) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireAuthedUser(req);
    const body = await req.json();
    const target_id = body.target_id as string | undefined;
    const text = body.text as string | undefined;
    const media_url = body.media_url as string | undefined;

    if (!target_id) return jsonResponse(errorResponse("target_id is required"), 400);
    if (!media_url) return jsonResponse(errorResponse("media_url is required (image URL)"), 400);

    const supabase = getSupabaseServiceClient();
    const { credentials: igCreds, integration: igIntegration, error: igErr } =
      await getDecryptedPlatformCredentials(supabase, user.id, "instagram");
    if (igErr || !igCreds || !igIntegration) {
      return jsonResponse(errorResponse(igErr || "Instagram integration not found"), 404);
    }

    const pageTokens = (igCreds as any).page_tokens as Record<string, string> | undefined;
    const pageToken = findConnectedPageToken({
      igTargetId: target_id,
      igMetadata: igIntegration.metadata,
      pageTokens,
    });
    if (!pageToken) return jsonResponse(errorResponse("No page token found. Run sync-meta-assets."), 400);

    // 1) Create media container
    const createRes = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(target_id)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: media_url,
        caption: text || "",
        access_token: pageToken,
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok || createJson?.error) {
      return jsonResponse(errorResponse(createJson?.error?.message || "Failed to create IG media container"), 400);
    }

    const creationId = createJson.id as string | undefined;
    if (!creationId) return jsonResponse(errorResponse("No creation id returned"), 400);

    // 2) Publish media container
    const publishRes = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(target_id)}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: pageToken,
      }),
    });
    const publishJson = await publishRes.json();
    if (!publishRes.ok || publishJson?.error) {
      return jsonResponse(errorResponse(publishJson?.error?.message || "Failed to publish IG media"), 400);
    }

    return jsonResponse(successResponse({ id: publishJson.id }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

