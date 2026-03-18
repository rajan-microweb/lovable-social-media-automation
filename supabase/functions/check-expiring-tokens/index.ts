import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  safeDecryptCredentials,
  updatePlatformCredentials,
} from "../_shared/encryption.ts";

// Configuration: Days before expiration to trigger actions
const ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS = 7;
const REFRESH_TOKEN_DISCONNECT_THRESHOLD_DAYS = 7;
const REFRESH_TOKEN_WARNING_THRESHOLD_DAYS = 30;

interface ExpiringToken {
  user_id: string;
  integration_id: string;
  platform: string;
  expires_in_days: number;
}

interface DisconnectWarning {
  user_id: string;
  integration_id: string;
  platform: string;
  refresh_expires_in_days: number;
}

interface AutoDisconnect {
  user_id: string;
  integration_id: string;
  platform: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date();

    // Fetch all active integrations we can manage
    const { data: integrations, error: fetchError } = await supabase
      .from("platform_integrations")
      .select("id, user_id, credentials, credentials_encrypted, metadata, platform_name")
      .eq("status", "active");

    if (fetchError) {
      console.error("[check-expiring-tokens] Database error:", fetchError.message);
      return jsonResponse(errorResponse(`Database error: ${fetchError.message}`), 500);
    }

    const needsAccessRefresh: ExpiringToken[] = [];
    const needsDisconnectWarning: DisconnectWarning[] = [];
    const shouldAutoDisconnect: AutoDisconnect[] = [];
    const refreshed: Array<{ integration_id: string; platform: string }> = [];
    const markedExpired: Array<{ integration_id: string; platform: string }> = [];

    async function markIntegrationExpired(integrationId: string) {
      const { error } = await supabase
        .from("platform_integrations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", integrationId);
      if (error) {
        console.error("[check-expiring-tokens] Failed to mark expired:", error.message);
      }
    }

    async function refreshOauthToken(args: {
      platform: string;
      refresh_token: string;
    }): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }> {
      const platform = args.platform.toLowerCase();
      if (platform === "youtube") {
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        if (!clientId || !clientSecret) throw new Error("Missing Google OAuth env");
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: args.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error_description || json?.error || "Google refresh failed");
        return json;
      }

      if (platform === "linkedin") {
        const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
        const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
        if (!clientId || !clientSecret) throw new Error("Missing LinkedIn OAuth env");
        const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: args.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error_description || json?.error || "LinkedIn refresh failed");
        return json;
      }

      if (platform === "x") {
        const clientId = Deno.env.get("X_CLIENT_ID");
        const clientSecret = Deno.env.get("X_CLIENT_SECRET");
        if (!clientId || !clientSecret) throw new Error("Missing X OAuth env");
        const res = await fetch("https://api.twitter.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: args.refresh_token,
            client_id: clientId,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error_description || json?.error || "X refresh failed");
        return json;
      }

      throw new Error(`Refresh not supported for platform: ${platform}`);
    }

    for (const integration of integrations || []) {
      try {
        const platform = (integration.platform_name || "").toLowerCase();
        const credentials = await safeDecryptCredentials(integration.credentials);
        if (!credentials || Object.keys(credentials).length === 0) continue;

        // Get expiration timestamps
        const expiresAt = (credentials.expires_at as string) || (credentials.expiresAt as string);
        const refreshTokenExpiresAt = (credentials.refresh_token_expires_at as string) || (credentials.refreshTokenExpiresAt as string);
        const refreshToken = (credentials.refresh_token as string) || (credentials.refreshToken as string);

        // If access token already expired, attempt refresh if possible; otherwise mark expired
        if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
          if (refreshToken && (platform === "linkedin" || platform === "youtube" || platform === "x")) {
            try {
              const refreshedToken = await refreshOauthToken({ platform, refresh_token: refreshToken });
              const newExpiresAt = refreshedToken.expires_in
                ? new Date(Date.now() + refreshedToken.expires_in * 1000).toISOString()
                : null;
              const merged = {
                ...credentials,
                access_token: refreshedToken.access_token,
                expires_at: newExpiresAt,
              } as Record<string, unknown>;
              if (refreshedToken.refresh_token) merged.refresh_token = refreshedToken.refresh_token;
              await updatePlatformCredentials(supabase, integration.id, merged);
              refreshed.push({ integration_id: integration.id, platform });
            } catch (e) {
              await markIntegrationExpired(integration.id);
              markedExpired.push({ integration_id: integration.id, platform });
            }
          } else {
            await markIntegrationExpired(integration.id);
            markedExpired.push({ integration_id: integration.id, platform });
          }
          continue;
        }

        // Check access token expiration
        if (expiresAt) {
          const expiresDate = new Date(expiresAt);
          const daysUntilExpiry = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExpiry <= ACCESS_TOKEN_REFRESH_THRESHOLD_DAYS && daysUntilExpiry > 0) {
            needsAccessRefresh.push({
              user_id: integration.user_id,
              integration_id: integration.id,
              platform: integration.platform_name,
              expires_in_days: daysUntilExpiry,
            });

            // Best-effort auto refresh for supported platforms
            if (refreshToken && (platform === "linkedin" || platform === "youtube" || platform === "x")) {
              try {
                const refreshedToken = await refreshOauthToken({ platform, refresh_token: refreshToken });
                const newExpiresAt = refreshedToken.expires_in
                  ? new Date(Date.now() + refreshedToken.expires_in * 1000).toISOString()
                  : null;
                const merged = {
                  ...credentials,
                  access_token: refreshedToken.access_token,
                  expires_at: newExpiresAt,
                } as Record<string, unknown>;
                if (refreshedToken.refresh_token) merged.refresh_token = refreshedToken.refresh_token;
                await updatePlatformCredentials(supabase, integration.id, merged);
                refreshed.push({ integration_id: integration.id, platform });
              } catch (e) {
                console.error("[check-expiring-tokens] Refresh failed:", e);
              }
            }
          }
        }

        // Check refresh token expiration
        if (refreshTokenExpiresAt) {
          const refreshExpiresDate = new Date(refreshTokenExpiresAt);
          const daysUntilRefreshExpiry = Math.floor((refreshExpiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntilRefreshExpiry <= 0) {
            // Refresh token already expired
            shouldAutoDisconnect.push({
              user_id: integration.user_id,
              integration_id: integration.id,
              platform: integration.platform_name,
              reason: "refresh_token_expired",
            });
          } else if (daysUntilRefreshExpiry <= REFRESH_TOKEN_DISCONNECT_THRESHOLD_DAYS) {
            // Within disconnect threshold - should auto-disconnect
            shouldAutoDisconnect.push({
              user_id: integration.user_id,
              integration_id: integration.id,
              platform: integration.platform_name,
              reason: `refresh_token_expires_in_${daysUntilRefreshExpiry}_days`,
            });
          } else if (daysUntilRefreshExpiry <= REFRESH_TOKEN_WARNING_THRESHOLD_DAYS) {
            // Within warning threshold
            needsDisconnectWarning.push({
              user_id: integration.user_id,
              integration_id: integration.id,
              platform: integration.platform_name,
              refresh_expires_in_days: daysUntilRefreshExpiry,
            });
          }
        }
      } catch (error) {
        console.error(`[check-expiring-tokens] Error processing integration ${integration.id}:`, error);
        continue;
      }
    }

    console.log(`[check-expiring-tokens] Results:`, {
      needs_access_refresh: needsAccessRefresh.length,
      needs_disconnect_warning: needsDisconnectWarning.length,
      should_auto_disconnect: shouldAutoDisconnect.length,
    });

    return jsonResponse(successResponse({
      needs_access_refresh: needsAccessRefresh,
      needs_disconnect_warning: needsDisconnectWarning,
      should_auto_disconnect: shouldAutoDisconnect,
      refreshed,
      marked_expired: markedExpired,
      checked_at: now.toISOString(),
    }));
  } catch (error) {
    console.error("Error in check-expiring-tokens:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
