import { corsHeaders, jsonResponse, validateApiKey, createSupabaseClient, getDecryptedPlatformCredentials } from "../_shared/encryption.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept API key or Bearer JWT
  const apiKey = req.headers.get("x-api-key");
  const expectedApiKey = Deno.env.get("N8N_API_KEY");
  const authHeader = req.headers.get("authorization");
  const hasValidApiKey = apiKey && apiKey === expectedApiKey;
  const hasBearer = authHeader && authHeader.startsWith("Bearer ");

  if (!hasValidApiKey && !hasBearer) {
    return jsonResponse({ success: false, data: null, error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { user_id, days = 30 } = body;

    if (!user_id) {
      return jsonResponse({ success: false, data: null, error: "user_id is required" }, 400);
    }

    const supabase = createSupabaseClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(supabase, user_id, "openai");

    if (credError || !credentials) {
      return jsonResponse({ success: false, data: null, error: credError || "No OpenAI credentials found" }, 404);
    }

    const openaiKey = (credentials.api_key || credentials.apiKey || credentials.key || credentials.openai_api_key) as string;

    if (!openaiKey) {
      return jsonResponse({ success: false, data: null, error: "OpenAI API key not found in credentials" }, 404);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    const headers = {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    };

    // Fetch subscription and usage in parallel
    const [subscriptionRes, usageRes] = await Promise.all([
      fetch("https://api.openai.com/v1/dashboard/billing/subscription", { headers }),
      fetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDateStr}&end_date=${endDateStr}`, { headers }),
    ]);

    // If both endpoints are unavailable (403/404 = new billing plan)
    if (!subscriptionRes.ok && (subscriptionRes.status === 403 || subscriptionRes.status === 404 || subscriptionRes.status === 401)) {
      console.log(`Billing API not available for this account: ${subscriptionRes.status}`);
      return jsonResponse({
        success: true,
        data: {
          available: false,
          message: "Billing details aren't available via API for this account type.",
        },
        error: null,
      });
    }

    if (!subscriptionRes.ok) {
      const errText = await subscriptionRes.text();
      console.error("Subscription API error:", subscriptionRes.status, errText);
      return jsonResponse({ success: false, data: null, error: `OpenAI billing API error: ${subscriptionRes.status}` }, 502);
    }

    const subData = await subscriptionRes.json();

    let usageData: { total_usage: number; daily_costs?: Array<{ timestamp: number; line_items: Array<{ name: string; cost: number }> }> } = { total_usage: 0 };
    if (usageRes.ok) {
      usageData = await usageRes.json();
    } else {
      console.warn("Usage API error:", usageRes.status);
    }

    // Process daily costs
    const daily: Array<{ date: string; cost_usd: number }> = [];
    if (usageData.daily_costs) {
      for (const day of usageData.daily_costs) {
        const date = new Date(day.timestamp * 1000).toISOString().split("T")[0];
        const cost = day.line_items.reduce((sum: number, item) => sum + item.cost, 0) / 100; // cents → dollars
        daily.push({ date, cost_usd: Math.round(cost * 10000) / 10000 });
      }
    }

    const totalUsageUsd = (usageData.total_usage || 0) / 100;

    return jsonResponse({
      success: true,
      data: {
        available: true,
        subscription: {
          plan: subData.plan?.title || "pay-as-you-go",
          hard_limit_usd: subData.hard_limit_usd ?? subData.system_hard_limit_usd ?? null,
          soft_limit_usd: subData.soft_limit_usd ?? null,
          access_until: subData.access_until ? new Date(subData.access_until * 1000).toISOString() : null,
        },
        usage: {
          total_usage_usd: Math.round(totalUsageUsd * 10000) / 10000,
          daily,
        },
      },
      error: null,
    });
  } catch (err) {
    console.error("proxy-openai-usage error:", err);
    return jsonResponse({ success: false, data: null, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
