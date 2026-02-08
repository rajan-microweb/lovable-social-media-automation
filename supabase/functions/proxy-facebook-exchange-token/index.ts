import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  encryptCredentials,
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
    const { user_id, short_lived_token } = await req.json();
    
    if (!user_id || !short_lived_token) {
      return jsonResponse(errorResponse("Missing user_id or short_lived_token"), 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Facebook app credentials from metadata or env
    console.log("[facebook] Fetching app credentials...");
    const { data: integration } = await supabase
      .from("platform_integrations")
      .select("metadata")
      .eq("user_id", user_id)
      .eq("platform_name", "facebook")
      .maybeSingle();

    const metadata = integration?.metadata as Record<string, unknown> | null;
    const appId = (metadata?.app_id as string) || Deno.env.get("FACEBOOK_APP_ID");
    const appSecret = (metadata?.app_secret as string) || Deno.env.get("FACEBOOK_APP_SECRET");

    if (!appId || !appSecret) {
      return jsonResponse(errorResponse("Facebook app credentials not configured"), 400);
    }

    // Exchange for long-lived token
    console.log("[facebook] Exchanging for long-lived token...");
    const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${short_lived_token}`;
    
    const response = await fetch(exchangeUrl);
    const data = await response.json();

    if (data.error) {
      console.error("[facebook] Token exchange error:", data.error.message);
      return jsonResponse(errorResponse(data.error.message), 400);
    }

    // Store the token securely in DB - never return it to n8n
    const newCredentials = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    const encryptedCredentials = await encryptCredentials(JSON.stringify(newCredentials));

    const { error: upsertError } = await supabase
      .from("platform_integrations")
      .upsert({
        user_id,
        platform_name: "facebook",
        credentials: encryptedCredentials,
        credentials_encrypted: true,
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform_name" });

    if (upsertError) {
      console.error("[facebook] Failed to store credentials:", upsertError.message);
      return jsonResponse(errorResponse("Failed to store credentials"), 500);
    }

    console.log("[facebook] Token exchanged and stored successfully");

    // Return only success status - NO credentials
    return jsonResponse(successResponse({
      message: "Token exchanged and stored securely",
      expires_in: data.expires_in,
    }));
  } catch (error) {
    console.error("Error in proxy-facebook-exchange-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
