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
 * Sync LinkedIn assets:
 * - personal profile via OpenID userinfo
 * - organizations where user is admin
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
      "linkedin",
    );
    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "LinkedIn integration not found"), 404);
    }

    const accessToken = (credentials.access_token || (credentials as any).accessToken) as string | undefined;
    if (!accessToken) return jsonResponse(errorResponse("No access token found"), 400);

    // Fetch user profile via OIDC userinfo
    let personalInfo: any = null;
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      personalInfo = {
        linkedin_id: `urn:li:person:${profile.sub}`,
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
      };
    }

    // Fetch organizations where user is admin
    const organizations: Array<{ company_id: string; company_name: string; logo_url: string | null }> = [];
    const orgsRes = await fetch(
      "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,logoV2(original~:playableStreams))))",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (orgsRes.ok) {
      const orgsData = await orgsRes.json();
      for (const element of orgsData.elements || []) {
        const org = element["organization~"];
        if (org) {
          organizations.push({
            company_id: `urn:li:organization:${org.id}`,
            company_name: org.localizedName,
            logo_url: org.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier || null,
          });
        }
      }
    }

    // Persist metadata in the shape expected by usePlatformAccounts
    await updatePlatformMetadata(supabase, integration.id, {
      ...(typeof integration.metadata === "object" && integration.metadata ? (integration.metadata as any) : {}),
      personal_info: personalInfo,
      organizations,
      synced_at: new Date().toISOString(),
    });

    return jsonResponse(successResponse({ personal_info: personalInfo, organizations }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

