import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
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
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "openai"
    );

    if (credError || !credentials) {
      return jsonResponse(successResponse({
        valid: false,
        message: credError || "OpenAI integration not found",
      }));
    }

    const openaiKey = (credentials.api_key || credentials.apiKey) as string;
    if (!openaiKey) {
      return jsonResponse(successResponse({
        valid: false,
        message: "No OpenAI API key found",
      }));
    }

    // Validate the stored OpenAI key by fetching account details
    console.log("[openai] Validating API key via /v1/me...");
    const response = await fetch("https://api.openai.com/v1/me", {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });

    if (!response.ok) {
      console.log("[openai] API key validation failed:", response.status);
      return jsonResponse(successResponse({
        valid: false,
        message: "Stored OpenAI API key is invalid or expired",
      }));
    }

    const accountData = await response.json();
    console.log("[openai] API key is valid, account retrieved");

    // Build metadata matching the expected format
    const personalInfo: Record<string, unknown> = {
      name: accountData.name || null,
      email: accountData.email || null,
      openai_user_id: accountData.id || null,
      phone: accountData.phone_number || null,
      avatar_url: accountData.picture || null,
      created_at: accountData.created
        ? new Date(accountData.created * 1000).toISOString()
        : null,
    };

    const organizations = (accountData.orgs?.data || []).map(
      (org: Record<string, unknown>) => ({
        org_id: org.id,
        org_name: org.name,
        org_title: org.title,
        role: org.role,
        is_default: org.is_default,
        is_personal: org.personal,
        description: org.description,
      })
    );

    return jsonResponse(successResponse({
      valid: true,
      message: "OpenAI API key is valid",
      personal_info: personalInfo,
      organizations,
    }));
  } catch (error) {
    console.error("Error in proxy-validate-openai:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
