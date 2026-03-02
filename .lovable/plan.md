
# Implement OpenAI API Cost Tracking

## Overview

This implements a full API cost tracking system: n8n sends per-call cost data (model name + cost) to the backend after each OpenAI generation, the backend cumulatively adds costs per model in a new `cost` column, and the Accounts page renders a breakdown by model with a total.

The n8n workflow already has "Calculate OpenAI Cost" and "Update OPENAI in Database" nodes wired up for every generation type — they just need the backend to accept and process the `cost` field properly.

---

## What n8n Currently Sends (from uploaded workflow)

Each "Calculate OpenAI Cost" node in n8n computes:
```json
{
  "total_tokens": "1234",
  "estimated_cost": "0.000469",
  "model": "gpt-4o-mini"
}
```
Then sends to `update-platform-integration`:
```json
{
  "platform_name": "openai",
  "user_id": "{{ userId }}",
  "updates": {
    "cost": "{ total_tokens: ..., estimated_cost: ..., model: ... }"
  }
}
```

**Problem**: The current Zod schema uses `.strict()` and does not allow a `cost` field, so all n8n cost updates are being rejected with a 400 validation error right now.

---

## Target Data Structure (stored in `cost` column)

```json
{
  "models": [
    { "model": "gpt-4o-mini", "cost": "0.00312" },
    { "model": "dall-e-3", "cost": "0.04000" },
    { "model": "gpt-4o", "cost": "0.01250" }
  ],
  "total_cost": "0.05562"
}
```

---

## Files to Create / Modify

| File | Action | Summary |
|---|---|---|
| `supabase/migrations/` | **Migration** | Add `cost` JSONB column to `platform_integrations` |
| `supabase/functions/update-platform-integration/index.ts` | **Modify** | Accept `cost` field, implement cumulative merge logic |
| `src/pages/Accounts.tsx` | **Modify** | Replace billing fallback UI with local cost display |

---

## 1. Database Migration

Add a nullable `cost` JSONB column to `platform_integrations`:

```sql
ALTER TABLE public.platform_integrations
ADD COLUMN IF NOT EXISTS cost JSONB DEFAULT NULL;
```

Default is `NULL` meaning no cost tracked yet. No RLS changes needed — the column is on the same table that already has correct per-user policies.

---

## 2. Update Edge Function: `update-platform-integration`

### Zod Schema Change
Add `cost` to the `updates` object (remove `.strict()` or add the field):

```typescript
updates: z.object({
  credentials: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(["active", "inactive", "expired"]).optional(),
  cost: z.union([z.record(z.unknown()), z.string()]).optional(), // NEW
}).strict(),
```

### Cumulative Merge Logic (added after metadata handling)

```typescript
if (updates.cost !== undefined) {
  // Parse incoming cost (n8n sends it as stringified JSON sometimes)
  let incomingCost: { model?: string; estimated_cost?: string; total_tokens?: string };
  if (typeof updates.cost === 'string') {
    incomingCost = JSON.parse(updates.cost);
  } else {
    incomingCost = updates.cost as typeof incomingCost;
  }

  // Fetch existing cost column
  const { data: existingRecord } = await supabase
    .from("platform_integrations")
    .select("cost")
    .eq("platform_name", platform_name)
    .eq("user_id", user_id)
    .single();

  const existingCost = (existingRecord?.cost as { models: Array<{model: string; cost: string}>; total_cost: string } | null) 
    ?? { models: [], total_cost: "0" };

  // Build model map and add incoming cost cumulatively
  const modelsMap: Record<string, number> = {};
  for (const m of existingCost.models) {
    modelsMap[m.model] = parseFloat(m.cost) || 0;
  }

  const modelName = incomingCost.model ?? "unknown";
  const newCost = parseFloat(incomingCost.estimated_cost ?? "0") || 0;
  modelsMap[modelName] = (modelsMap[modelName] || 0) + newCost;

  const mergedModels = Object.entries(modelsMap).map(([model, cost]) => ({
    model,
    cost: cost.toString(),
  }));
  const totalCost = mergedModels.reduce((sum, m) => sum + parseFloat(m.cost), 0);

  updateData.cost = {
    models: mergedModels,
    total_cost: totalCost.toString(),
  };
}
```

---

## 3. Frontend Changes in `Accounts.tsx`

### New State & Types

```typescript
interface ApiCostModel { model: string; cost: string; }
interface ApiCost { models: ApiCostModel[]; total_cost: string; }
```

The `cost` data will be passed through `fetchConnectedAccounts` — it already fetches the full `platform_integrations` row. We add `cost` to the `ConnectedAccount` interface and pass it through.

### New UI Section (replaces the existing "Usage & Balance" collapsible)

Instead of calling the `proxy-openai-usage` edge function (which fails for new accounts), we show the locally-tracked cost data directly from the database row. The section shows:

- **Per-model breakdown**: table rows with model name, formatted cost ($0.00000)
- **Total cost**: prominent total at the bottom
- **"View on OpenAI"** link: always present for full usage history

```typescript
const formatCost = (cost: string) => {
  const n = parseFloat(cost);
  return isNaN(n) ? '$0.00000' : `$${n.toFixed(5)}`;
};
```

The section renders inside the existing OpenAI card after the Organizations block, visible without any collapsible (since it's local data, no loading needed). If `cost` is null (no calls tracked yet), show a subtle "No usage tracked yet" message.

### Fetch Update

In `fetchConnectedAccounts`, add `cost` to the select and map it into the account object:

```typescript
const { data } = await supabase
  .from("platform_integrations")
  .select("id, platform_name, credentials, metadata, status, cost") // add cost
  ...

// In the OpenAI account mapping:
apiCost: integration.cost as ApiCost | null,
```

---

## Technical Notes

- The n8n workflow sends `user_id` as `$('Webhook').item.json.body.user_id` (note: lowercase `user_id` not `userId`) — this is already correct for the edge function
- The `cost_usd` field from proxy functions is more accurate than n8n's flat `0.00000038` rate — but since the n8n workflow already has these nodes and we can't change n8n here, we accept its calculation. The proxy functions already return `cost_usd` in their response which n8n reads via `$json.data.tokens_used.total * 0.00000038` — so the cost shown will reflect n8n's calculated value
- The `cost` column is separate from `credentials` and `metadata` — it is never encrypted since it contains no sensitive data
- No new migration is needed for RLS — the existing `Users can update own integrations` policy on `platform_integrations` covers the new column automatically
