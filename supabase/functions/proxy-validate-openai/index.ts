import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeDecryptCredentials } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("N8N_API_KEY");
    
    if (!apiKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get OpenAI integration from DB
    const { data: integration, error: intError } = await supabase
      .from("platform_integrations")
      .select("credentials")
      .eq("user_id", user_id)
      .eq("platform_name", "openai")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "OpenAI integration not found", valid: false }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credentials = await safeDecryptCredentials(integration.credentials);
    const openaiKey = credentials.api_key as string;

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "No OpenAI API key found", valid: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the stored OpenAI key
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        valid: false, 
        message: "Stored OpenAI API key is invalid or expired" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return only validation status - NO credentials
    return new Response(JSON.stringify({ 
      valid: true, 
      message: "OpenAI API key is valid" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in proxy-validate-openai:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
