import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
  updatePlatformCredentials,
} from "../_shared/encryption.ts";

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

    // Parse request
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse(errorResponse("Missing user_id"), 400);
    }

    // Get decrypted credentials
    const supabase = createSupabaseClient();
    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "youtube"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "YouTube integration not found"), 404);
    }

    const refreshToken = credentials.refresh_token as string;
    if (!refreshToken) {
      return jsonResponse(errorResponse("No refresh token found"), 400);
    }

    // Get OAuth client credentials from metadata or env
    const metadata = integration.metadata as Record<string, unknown> | null;
    const clientId = (metadata?.client_id as string) || Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = (metadata?.client_secret as string) || Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return jsonResponse(errorResponse("Google OAuth credentials not configured"), 400);
    }

    // Refresh the token
    console.log("[youtube] Refreshing access token...");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[youtube] Token refresh error:", data.error_description || data.error);
      return jsonResponse(errorResponse(data.error_description || data.error), 400);
    }

    // Update credentials with new access token
    const updatedCredentials = {
      ...credentials,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    const updateResult = await updatePlatformCredentials(supabase, integration.id, updatedCredentials);
    
    if (!updateResult.success) {
      return jsonResponse(errorResponse("Failed to store refreshed token"), 500);
    }

    console.log("[youtube] Token refreshed successfully");

    // Return only success status - NO credentials
    return jsonResponse(successResponse({
      message: "Token refreshed and stored securely",
      expires_in: data.expires_in,
    }));
  } catch (error) {
    console.error("Error in proxy-youtube-refresh-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
