import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  safeDecryptCredentials,
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

    // Fetch all active LinkedIn integrations
    const { data: integrations, error: fetchError } = await supabase
      .from("platform_integrations")
      .select("id, user_id, credentials, credentials_encrypted, metadata, platform_name")
      .eq("platform_name", "linkedin")
      .eq("status", "active");

    if (fetchError) {
      console.error("[check-expiring-tokens] Database error:", fetchError.message);
      return jsonResponse(errorResponse(`Database error: ${fetchError.message}`), 500);
    }

    const needsAccessRefresh: ExpiringToken[] = [];
    const needsDisconnectWarning: DisconnectWarning[] = [];
    const shouldAutoDisconnect: AutoDisconnect[] = [];

    for (const integration of integrations || []) {
      try {
        // Decrypt credentials
        let credentials: Record<string, unknown>;
        
        if (integration.credentials_encrypted === true) {
          // For legacy pgcrypto format
          const encryptedValue = typeof integration.credentials === 'string' 
            ? integration.credentials 
            : JSON.stringify(integration.credentials).replace(/^"|"$/g, '');
          
          const { data: decryptedData, error: decryptError } = await supabase.rpc(
            'decrypt_credentials',
            { encrypted_creds: encryptedValue }
          );
          
          if (decryptError || !decryptedData) {
            console.error(`[check-expiring-tokens] Decryption failed for ${integration.id}`);
            continue;
          }
          
          credentials = typeof decryptedData === 'string' ? JSON.parse(decryptedData) : decryptedData;
        } else {
          credentials = await safeDecryptCredentials(integration.credentials);
        }

        // Get expiration timestamps
        const expiresAt = credentials.expires_at as string;
        const refreshTokenExpiresAt = credentials.refresh_token_expires_at as string;

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
      checked_at: now.toISOString(),
    }));
  } catch (error) {
    console.error("Error in check-expiring-tokens:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
