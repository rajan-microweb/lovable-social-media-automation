import {
  corsHeaders,
  errorResponse,
  getDecryptedPlatformCredentials,
  jsonResponse,
  successResponse,
  updatePlatformCredentials,
  updatePlatformMetadata,
} from "../_shared/encryption.ts";
import { getSupabaseAuthClient, getSupabaseServiceClient, requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Sync Meta assets after OAuth connect:
 * - Facebook Pages (id, name, picture)
 * - Instagram business accounts connected to those pages
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

    // Use Facebook integration as the source of the user token
    const { credentials: fbCreds, integration: fbIntegration, error: fbErr } =
      await getDecryptedPlatformCredentials(supabase, user.id, "facebook");
    if (fbErr || !fbCreds || !fbIntegration) {
      return jsonResponse(errorResponse(fbErr || "Facebook integration not found"), 404);
    }

    const userAccessToken = (fbCreds.access_token || (fbCreds as any).accessToken) as string | undefined;
    if (!userAccessToken) {
      return jsonResponse(errorResponse("No Meta access token found"), 400);
    }

    // 1) Fetch pages and their page access tokens
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url}&access_token=${encodeURIComponent(userAccessToken)}`,
    );
    const pagesJson = await pagesRes.json();
    if (!pagesRes.ok || pagesJson?.error) {
      return jsonResponse(errorResponse(pagesJson?.error?.message || "Failed to fetch Facebook pages"), 400);
    }

    const pageTokens: Record<string, string> = {};
    const pages = (pagesJson.data || []).map(
      (p: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }) => {
        if (p?.access_token) {
          // Store by both id and name for compatibility with older flows
          if (p?.id) pageTokens[p.id] = p.access_token;
          if (p?.name) pageTokens[p.name] = p.access_token;
        }
        return {
          page_id: p.id,
          page_name: p.name,
          picture_url: p.picture?.data?.url || null,
        };
      },
    );

    // Store page tokens in encrypted credentials for facebook (and instagram for convenience)
    await updatePlatformCredentials(supabase, fbIntegration.id, { ...(fbCreds as any), page_tokens: pageTokens });

    const { credentials: igCreds, integration: igIntegration } = await getDecryptedPlatformCredentials(
      supabase,
      user.id,
      "instagram",
    );
    if (igCreds && igIntegration) {
      await updatePlatformCredentials(supabase, igIntegration.id, { ...(igCreds as any), page_tokens: pageTokens });
    }

    // 2) Fetch IG business accounts per page
    const accounts: Array<{
      ig_business_id: string;
      ig_username: string;
      profile_picture_url: string | null;
      connected_page_id: string;
      connected_page_name: string;
    }> = [];

    for (const page of pagesJson.data || []) {
      if (!page?.id || !page?.access_token) continue;
      const igRes = await fetch(
        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(page.access_token)}`,
      );
      const igJson = await igRes.json();
      if (igRes.ok && igJson?.instagram_business_account) {
        accounts.push({
          ig_business_id: igJson.instagram_business_account.id,
          ig_username: igJson.instagram_business_account.username,
          profile_picture_url: igJson.instagram_business_account.profile_picture_url || null,
          connected_page_id: page.id,
          connected_page_name: page.name,
        });
      }
    }

    // 3) Persist non-sensitive asset lists into metadata
    await updatePlatformMetadata(supabase, fbIntegration.id, {
      ...(typeof fbIntegration.metadata === "object" && fbIntegration.metadata ? (fbIntegration.metadata as any) : {}),
      pages,
      synced_at: new Date().toISOString(),
    });

    if (igIntegration) {
      await updatePlatformMetadata(supabase, igIntegration.id, {
        ...(typeof igIntegration.metadata === "object" && igIntegration.metadata ? (igIntegration.metadata as any) : {}),
        accounts,
        synced_at: new Date().toISOString(),
      });
    }

    return jsonResponse(successResponse({ pages, accounts }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

