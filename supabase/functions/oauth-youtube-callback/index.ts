import { corsHeaders, encryptCredentials, updatePlatformMetadata } from "../_shared/encryption.ts";
import { consumeOAuthState, getSupabaseServiceClient, redirect } from "../_shared/oauth.ts";

/**
 * YouTube OAuth callback (code -> tokens)
 * Env required:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URI
 * - APP_OAUTH_SUCCESS_REDIRECT
 */

async function upsertYouTubeIntegration(params: {
  user_id: string;
  credentials: Record<string, unknown>;
}) {
  const supabase = getSupabaseServiceClient();
  const encrypted = await encryptCredentials(JSON.stringify(params.credentials));

  const { data, error } = await supabase
    .from("platform_integrations")
    .upsert(
      {
        user_id: params.user_id,
        platform_name: "youtube",
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

  return { integration_id: data.id, supabase };
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
      platform_name: "youtube",
      state,
    });

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing Google OAuth env");
    }
    if (!pkce_verifier) throw new Error("Missing PKCE verifier");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: pkce_verifier,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenJson?.error_description || tokenJson?.error || "Google token exchange failed");
    }

    const access_token = tokenJson.access_token as string | undefined;
    const refresh_token = tokenJson.refresh_token as string | undefined;
    const expires_in = tokenJson.expires_in as number | undefined;
    if (!access_token) throw new Error("No access_token from Google");

    const expires_at = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { integration_id, supabase } = await upsertYouTubeIntegration({
      user_id,
      credentials: {
        access_token,
        refresh_token: refresh_token ?? null,
        expires_at,
        scope: tokenJson.scope ?? null,
        token_type: tokenJson.token_type ?? "bearer",
      },
    });

    // Minimal metadata now; full channel list will be set in sync-youtube-assets todo
    await updatePlatformMetadata(supabase, integration_id, {
      syncing: true,
      connected_at: new Date().toISOString(),
    });

    const appRedirect = redirect_to || Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "youtube");
    finalUrl.searchParams.set("success", "1");
    return redirect(finalUrl.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const appRedirect = Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "youtube");
    finalUrl.searchParams.set("success", "0");
    finalUrl.searchParams.set("error", message);
    return redirect(finalUrl.toString());
  }
});

