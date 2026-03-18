import { corsHeaders } from "../_shared/encryption.ts";
import {
  createOAuthState,
  generatePkceVerifier,
  pkceChallengeS256,
  requireAuthedUser,
} from "../_shared/oauth.ts";

/**
 * Meta OAuth start (Facebook Login) to cover Facebook Pages + Instagram Graph + Threads.
 * Env required:
 * - META_APP_ID
 * - META_REDIRECT_URI (must point to oauth-meta-callback)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await requireAuthedUser(req);

    const appId = Deno.env.get("META_APP_ID");
    const redirectUri = Deno.env.get("META_REDIRECT_URI");
    if (!appId || !redirectUri) {
      return new Response(JSON.stringify({ error: "Missing Meta OAuth env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let redirect_to = url.searchParams.get("redirect_to");
    if (!redirect_to && req.method !== "GET") {
      try {
        const bodyText = await req.text();
        if (bodyText?.trim()) {
          const body = JSON.parse(bodyText);
          redirect_to = body.redirect_to || null;
        }
      } catch {
        // ignore
      }
    }

    const verifier = generatePkceVerifier();
    const challenge = await pkceChallengeS256(verifier);

    const { state } = await createOAuthState({
      user_id: user.id,
      platform_name: "meta",
      redirect_to,
      pkce_verifier: verifier,
    });

    // Scopes: keep broad enough for pages + IG publish; threads scopes may require separate approval.
    const scope = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      // Threads (if approved/enabled):
      "threads_basic",
      "threads_content_publish",
    ].join(",");

    const authUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    // PKCE
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

