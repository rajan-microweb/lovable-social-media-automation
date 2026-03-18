import { corsHeaders } from "../_shared/encryption.ts";
import {
  createOAuthState,
  generatePkceVerifier,
  pkceChallengeS256,
  requireAuthedUser,
} from "../_shared/oauth.ts";

/**
 * X (Twitter) OAuth2 start (PKCE)
 * Env required:
 * - X_CLIENT_ID
 * - X_REDIRECT_URI (must point to oauth-x-callback)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await requireAuthedUser(req);
    const clientId = Deno.env.get("X_CLIENT_ID");
    const redirectUri = Deno.env.get("X_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "Missing X OAuth env" }), {
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
      platform_name: "x",
      redirect_to,
      pkce_verifier: verifier,
    });

    const scope = [
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
    ].join(" ");

    const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("state", state);
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

