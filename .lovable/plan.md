
# Add OpenAI API Usage & Balance History to Accounts Page

## What We're Building

Two new visual sections inside the existing OpenAI account card on the Accounts page:

1. **Credit Balance** — Shows remaining credits and total granted credits (from `/v1/dashboard/billing/subscription`)
2. **Usage History** — Shows daily token usage for the last 30 days as a simple bar chart (from `/v1/dashboard/billing/usage`)

### Important Limitation

OpenAI's billing/usage endpoints (`/v1/dashboard/billing/subscription` and `/v1/dashboard/billing/usage`) are undocumented but still work for many accounts. However, they **do not work** for accounts on the new usage-based billing plan (post-2024 API accounts) and require a standard `sk-` key. When the endpoint returns an error, we gracefully show a "View on OpenAI Dashboard" link instead.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/functions/proxy-openai-usage/index.ts` | **Create** — new edge function |
| `src/pages/Accounts.tsx` | **Modify** — render usage/balance in OpenAI card |

---

## 1. New Edge Function: `proxy-openai-usage`

Accepts `user_id` + optional `days` (default 30). Decrypts the stored OpenAI API key, then calls two OpenAI endpoints in parallel:

- `GET https://api.openai.com/v1/dashboard/billing/subscription` — returns `hard_limit_usd`, `soft_limit_usd`, `system_hard_limit_usd`
- `GET https://api.openai.com/v1/dashboard/billing/usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — returns daily breakdown

Returns a combined response:

```json
{
  "success": true,
  "data": {
    "subscription": {
      "plan": "pay-as-you-go",
      "hard_limit_usd": 10.00,
      "soft_limit_usd": 8.00,
      "access_until": "2025-12-31T00:00:00Z"
    },
    "usage": {
      "total_usage_usd": 4.23,
      "daily": [
        { "date": "2025-02-01", "cost_usd": 0.12 },
        ...
      ]
    },
    "available": true
  }
}
```

If the billing endpoints return 403/401 (not available for this account type), returns `"available": false` with a message so the UI can show a dashboard link instead.

---

## 2. Frontend Changes in `Accounts.tsx`

Add state for usage data per OpenAI account and a "fetch usage" trigger:

```typescript
const [openaiUsage, setOpenaiUsage] = useState<OpenAIUsageData | null>(null);
const [loadingUsage, setLoadingUsage] = useState(false);
```

Inside the OpenAI account card (after the Organizations section), add a new collapsible "Usage & Balance" section with:

- **Balance bar**: Visual progress bar showing `total_used / hard_limit` with dollar amounts
- **Last 30 days chart**: Mini bar chart (using Recharts `BarChart` already in the project) showing daily cost
- **Refresh button**: Re-fetches usage data
- **Fallback**: If `available: false`, shows an info box with a link to `https://platform.openai.com/usage`

The usage is fetched automatically when the OpenAI section is expanded/connected, using `supabase.functions.invoke("proxy-openai-usage", { body: { user_id } })`.

---

## Technical Details

### Edge Function Auth
Uses the same pattern as all other proxy functions — validates `x-api-key` header against `N8N_API_KEY` secret, OR accepts a Bearer JWT from the frontend (same pattern introduced in `store-platform-integration`).

### config.toml
Add entry:
```toml
[functions.proxy-openai-usage]
verify_jwt = false
```

### Recharts Usage
The project already has `recharts` installed. We'll use:
- `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer` from recharts
- Keep the chart compact (height: 120px) inside the card

### Graceful Degradation
If OpenAI returns 403 (common for newer accounts), the function returns `{ available: false }` and the UI shows:
> "Billing details aren't available via API for this account type. View your usage at platform.openai.com/usage"

This avoids showing errors and keeps the UX clean.
