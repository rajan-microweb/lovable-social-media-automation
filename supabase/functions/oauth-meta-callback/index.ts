import { corsHeaders, encryptCredentials } from "../_shared/encryption.ts";
import { consumeOAuthState, getSupabaseServiceClient, redirect } from "../_shared/oauth.ts";

/**
 * Meta OAuth callback (code -> token -> long-lived token)
 * Env required:
 * - META_APP_ID
 * - META_APP_SECRET
 * - META_REDIRECT_URI
 * - APP_OAUTH_SUCCESS_REDIRECT
 */

async function upsertMetaIntegration(params: {
  user_id: string;
  platform_name: "facebook" | "instagram" | "threads";
  credentials: Record<string, unknown>;
}) {
  const supabase = getSupabaseServiceClient();
  const encrypted = await encryptCredentials(JSON.stringify(params.credentials));

  const { data, error } = await supabase
    .from("platform_integrations")
    .upsert(
      {
        user_id: params.user_id,
        platform_name: params.platform_name,
        credentials: encrypted,
        credentials_encrypted: true,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform_name" },
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to upsert integration: ${error?.message || "unknown"}`);
  }

  return { integration_id: data.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDesc = url.searchParams.get("error_description");

    if (errorParam) {
      return new Response(JSON.stringify({ error: errorParam, description: errorDesc }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code/state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, pkce_verifier, redirect_to } = await consumeOAuthState({
      platform_name: "meta",
      state,
    });

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    const redirectUri = Deno.env.get("META_REDIRECT_URI");
    if (!appId || !appSecret || !redirectUri) {
      throw new Error("Missing Meta OAuth env");
    }

    // 1) Exchange code -> short-lived user access token
    const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    if (pkce_verifier) {
      tokenUrl.searchParams.set("code_verifier", pkce_verifier);
    }

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || tokenJson?.error) {
      throw new Error(tokenJson?.error?.message || "Meta token exchange failed");
    }

    const shortToken = tokenJson.access_token as string | undefined;
    if (!shortToken) throw new Error("No access_token from Meta");

    // 2) Exchange short-lived -> long-lived
    const longUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const longRes = await fetch(longUrl.toString());
    const longJson = await longRes.json();
    if (!longRes.ok || longJson?.error) {
      throw new Error(longJson?.error?.message || "Meta long-lived token exchange failed");
    }

    const access_token = (longJson.access_token as string | undefined) ?? shortToken;
    const expires_in = (longJson.expires_in as number | undefined) ?? (tokenJson.expires_in as number | undefined);
    const expires_at = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const storedCreds = {
      access_token,
      expires_at,
      token_type: longJson.token_type ?? tokenJson.token_type ?? "bearer",
    };

    // Store the same Meta user token under the platform keys our UI already understands.
    // Asset sync will populate platform-specific metadata (pages, ig accounts, etc.).
    await Promise.all([
      upsertMetaIntegration({ user_id, platform_name: "facebook", credentials: storedCreds }),
      upsertMetaIntegration({ user_id, platform_name: "instagram", credentials: storedCreds }),
      upsertMetaIntegration({ user_id, platform_name: "threads", credentials: storedCreds }),
    ]);

    const appRedirect = redirect_to || Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "meta");
    finalUrl.searchParams.set("success", "1");
    return redirect(finalUrl.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const appRedirect = Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "meta");
    finalUrl.searchParams.set("success", "0");
    finalUrl.searchParams.set("error", message);
    return redirect(finalUrl.toString());
  }
});

