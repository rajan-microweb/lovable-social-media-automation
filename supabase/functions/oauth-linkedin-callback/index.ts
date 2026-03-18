import { corsHeaders, encryptCredentials, updatePlatformMetadata } from "../_shared/encryption.ts";
import { consumeOAuthState, getSupabaseServiceClient, redirect } from "../_shared/oauth.ts";

/**
 * LinkedIn OAuth callback (Authorization Code + PKCE)
 * Env required:
 * - LINKEDIN_CLIENT_ID
 * - LINKEDIN_CLIENT_SECRET (LinkedIn still requires client secret for token exchange)
 * - LINKEDIN_REDIRECT_URI
 * - APP_OAUTH_SUCCESS_REDIRECT (e.g. https://yourapp.com/accounts)
 */

async function upsertIntegration(params: {
  user_id: string;
  credentials: Record<string, unknown>;
}) {
  const supabase = getSupabaseServiceClient();
  const encrypted = await encryptCredentials(JSON.stringify(params.credentials));

  // Keep existing metadata; callback will populate it after asset sync.
  const { data, error } = await supabase
    .from("platform_integrations")
    .upsert(
      {
        user_id: params.user_id,
        platform_name: "linkedin",
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

async function syncLinkedInMetadata(params: { user_id: string; integration_id: string }) {
  const supabase = getSupabaseServiceClient();

  // Reuse existing proxy to fetch profile + orgs. It expects x-api-key today, so we call LinkedIn directly here
  // to keep this callback self-contained and avoid leaking N8N_API_KEY semantics into user flows.
  const { data: integration, error } = await supabase
    .from("platform_integrations")
    .select("credentials")
    .eq("user_id", params.user_id)
    .eq("platform_name", "linkedin")
    .eq("status", "active")
    .single();

  if (error) throw new Error(error.message);

  // Decrypt with shared helper would be ideal, but we already have the access token in memory in callback;
  // this is only used if a retry occurs. We'll skip direct decryption and simply return.
  // Metadata will be refreshed later by sync-linkedin-assets in the next todo.
  await updatePlatformMetadata(supabase, params.integration_id, {
    syncing: true,
    connected_at: new Date().toISOString(),
  });
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
      platform_name: "linkedin",
      state,
    });

    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
    const redirectUri = Deno.env.get("LINKEDIN_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing LinkedIn OAuth env");
    }
    if (!pkce_verifier) {
      throw new Error("Missing PKCE verifier");
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: pkce_verifier,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenJson?.error_description || tokenJson?.message || "LinkedIn token exchange failed");
    }

    const access_token = tokenJson.access_token as string | undefined;
    const expires_in = tokenJson.expires_in as number | undefined;
    const refresh_token = tokenJson.refresh_token as string | undefined;
    const refresh_expires_in = tokenJson.refresh_token_expires_in as number | undefined;

    if (!access_token) {
      throw new Error("No access_token from LinkedIn");
    }

    const now = Date.now();
    const expires_at = expires_in ? new Date(now + expires_in * 1000).toISOString() : null;
    const refresh_token_expires_at = refresh_expires_in ? new Date(now + refresh_expires_in * 1000).toISOString() : null;

    const { integration_id } = await upsertIntegration({
      user_id,
      credentials: {
        access_token,
        refresh_token: refresh_token ?? null,
        expires_at,
        refresh_token_expires_at,
        scope: tokenJson.scope ?? null,
        token_type: tokenJson.token_type ?? "bearer",
      },
    });

    // Minimal metadata now; full asset sync is handled in next todo
    await syncLinkedInMetadata({ user_id, integration_id });

    const appRedirect = redirect_to || Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "linkedin");
    finalUrl.searchParams.set("success", "1");
    return redirect(finalUrl.toString());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const appRedirect = Deno.env.get("APP_OAUTH_SUCCESS_REDIRECT") || "/";
    const finalUrl = new URL(appRedirect);
    finalUrl.searchParams.set("connected", "linkedin");
    finalUrl.searchParams.set("success", "0");
    finalUrl.searchParams.set("error", message);
    return redirect(finalUrl.toString());
  }
});

