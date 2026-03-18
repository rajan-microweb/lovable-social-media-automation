import { corsHeaders, encryptCredentials, updatePlatformMetadata } from "../_shared/encryption.ts";
import { consumeOAuthState, getSupabaseServiceClient, redirect } from "../_shared/oauth.ts";

/**
 * X (Twitter) OAuth2 callback (PKCE)
 * Env required:
 * - X_CLIENT_ID
 * - X_CLIENT_SECRET (required for confidential clients; if you configured a public client, you can omit and adjust)
 * - X_REDIRECT_URI
 * - APP_OAUTH_SUCCESS_REDIRECT
 */

async function upsertXIntegration(params: {
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
        platform_name: "x",
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
      platform_name: "x",
      state,
    });

    const clientId = Deno.env.get("X_CLIENT_ID");
    const clientSecret = Deno.env.get("X_CLIENT_SECRET");
    const redirectUri = Deno.env.get("X_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new Error("Missing X OAuth env");
    if (!pkce_verifier) throw new Error("Missing PKCE verifier");

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(clientSecret
          ? {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            }
          : {}),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: pkce_verifier,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenJson?.error_description || tokenJson?.error || "X token exchange failed");
    }

    const access_token = tokenJson.access_token as string | undefined;
    const refresh_token = tokenJson.refresh_token as string | undefined;
    const expires_in = tokenJson.expires_in as number | undefined;
    if (!access_token) throw new Error("No access_token from X");

    const expires_at = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { integration_id, supabase } = await upsertXIntegration({
      user_id,
      credentials: {
        access_token,
        refresh_token: refresh_token ?? null,
        expires_at,
        scope: tokenJson.scope ?? null,
        token_type: tokenJson.token_type ?? "bearer",
      },
    });

    await updatePlatformMetadata(supabase, integration_id, {
      syncing: true,
      connected_at: new Date().toISOString(),
    });

    const appRedirect = redirect_to || Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "x");
    finalUrl.searchParams.set("success", "1");
    return redirect(finalUrl.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const appRedirect = Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "x");
    finalUrl.searchParams.set("success", "0");
    finalUrl.searchParams.set("error", message);
    return redirect(finalUrl.toString());
  }
});

