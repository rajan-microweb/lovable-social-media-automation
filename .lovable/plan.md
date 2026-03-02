
# Fix: Image Generation 502 — Async Job Pattern

## Root Cause

DALL-E 3 image generation takes 15–60 seconds. Cloudflare (which sits in front of Supabase Edge Functions) enforces a hard **100-second gateway timeout**. When n8n waits for `proxy-openai-generate-image` to return a complete image URL, the connection times out before OpenAI finishes, resulting in the 502 Bad Gateway error.

This is the same problem that was already solved for video generation using an async job + polling pattern. Image generation needs the exact same treatment.

---

## Current vs Target Flow

```text
CURRENT (broken):
n8n → proxy-openai-generate-image → [waits 15-60s] → 502 timeout

TARGET (async):
n8n → proxy-openai-start-image   → returns { jobId } immediately
n8n → Respond to Webhook (jobId)
Frontend polls → check-image-status webhook
Frontend → proxy-openai-check-image → OpenAI polling → imageUrl
```

---

## What Needs to Change

| File | Change |
|---|---|
| `supabase/functions/proxy-openai-start-image/index.ts` | NEW — calls OpenAI Images API with `response_format: "url"`, stores job in DB, returns `{ jobId, status: "processing" }` |
| `supabase/functions/proxy-openai-check-image/index.ts` | NEW — polls DB/OpenAI for job result, returns `{ status, imageUrl }` |
| `supabase/config.toml` | Add `verify_jwt = false` entries for both new functions |
| `src/components/AiPromptModal.tsx` | Add `pollImageStatus` (mirrors `pollVideoStatus`), update image handler to use polling |
| **n8n workflow** | IMAGE Generation node → calls `proxy-openai-start-image`; add `check-image-status` webhook path (mirrors video pattern) |

---

## Technical Design

### Problem: OpenAI Images API is Synchronous

Unlike Sora (video), the OpenAI DALL-E API (`POST /v1/images/generations`) doesn't natively return a job ID — it blocks until the image is ready. So we need to create our own async layer using the database as a job queue.

### Job Queue Approach (using `platform_integrations` metadata)

Rather than creating a new table, we store image jobs in a temporary JSONB structure in a new `image_jobs` column or — more simply — we store them in a lightweight new table.

Actually, the simplest approach that avoids a new migration: store the pending job in the `platform_integrations` metadata field temporarily, keyed by a generated job ID. On check, look up the job and return its status.

Even simpler: use **Supabase Edge Function background tasks** via `EdgeRuntime.waitUntil()` — the function responds immediately with a job ID, then continues processing the DALL-E call in the background and writes the result to a new `image_generation_jobs` table. The check function reads from that table.

### Database: New `image_generation_jobs` Table

```sql
CREATE TABLE public.image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',  -- processing | completed | failed
  image_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own image jobs"
  ON public.image_generation_jobs FOR SELECT
  USING (auth.uid() = user_id);
```

The edge function uses the **service role key** (already available) to write results, bypassing RLS — this is required since the background task runs after the response is sent.

### `proxy-openai-start-image` (NEW)

```
1. Validate API key
2. Extract user_id, imagePrompt
3. Decrypt OpenAI credentials (same as existing image function)
4. INSERT a job row into image_generation_jobs (status: 'processing')
5. Respond immediately: { jobId: row.id, status: "processing" }
6. EdgeRuntime.waitUntil(async () => {
     Call OpenAI /v1/images/generations
     On success: UPDATE job SET status='completed', image_url=...
     On error:   UPDATE job SET status='failed', error=...
   })
```

This is the key pattern: `EdgeRuntime.waitUntil()` lets the function respond to n8n instantly while the actual DALL-E call continues running in the background — no timeout.

### `proxy-openai-check-image` (NEW)

```
1. Validate API key
2. Extract user_id, jobId
3. SELECT from image_generation_jobs WHERE id = jobId AND user_id = user_id
4. Return { status, imageUrl } based on row status
```

This is a simple DB read — executes in milliseconds.

### `AiPromptModal.tsx` Changes

Add a `CHECK_IMAGE_WEBHOOK` constant pointing to the n8n check-image-status webhook, and a `pollImageStatus()` function mirroring `pollVideoStatus()`:

```typescript
const IMAGE_POLL_INTERVAL_MS = 5_000;    // 5s — faster than video
const IMAGE_MAX_POLL_DURATION_MS = 3 * 60 * 1000;  // 3 min max
const CHECK_IMAGE_WEBHOOK = "https://n8n.srv1248804.hstgr.cloud/webhook/check-image-status";
```

Update the image result handler in `handleGenerate`:

```typescript
// Before (broken):
const imageUrl = data.imageUrl || ...
if (!imageUrl) throw new Error(...)
...

// After (async):
const jobId = data.jobId || data.data?.jobId;
if (jobId) {
  // Async path — poll for result
  setUploadProgress("Generating image...");
  const imageUrl = await pollImageStatus(jobId);
  const permanent = await uploadAiMedia(imageUrl.trim(), "image");
  onGenerate(permanent);
} else {
  // Synchronous fallback (backwards compat)
  const imageUrl = data.imageUrl || data.image_url || data.data?.imageUrl || data.url || "";
  if (!imageUrl) throw new Error(...)
  ...
}
```

### n8n Workflow Changes Required

You will need to update your n8n workflow after this implementation:

1. **IMAGE Generation node**: Change the URL from `proxy-openai-generate-image` → `proxy-openai-start-image`
2. **Respond to Webhook1**: Already responds with `{ jobId, status }` (same shape as video, line 39 in the uploaded workflow — it returns `$json.data.imageUrl` currently, needs to return `$json.data.jobId` and `$json.data.status`)
3. **Add new webhook**: Add a `check-image-status` webhook (path `/check-image-status`) that calls `proxy-openai-check-image` and responds with `{ status, imageUrl }` — mirror the existing video status check path

---

## Files to Create/Modify

1. **NEW** `supabase/functions/proxy-openai-start-image/index.ts`
2. **NEW** `supabase/functions/proxy-openai-check-image/index.ts`
3. **MODIFY** `supabase/config.toml` — add `verify_jwt = false` for both new functions
4. **MODIFY** `src/components/AiPromptModal.tsx` — add image polling logic
5. **DATABASE MIGRATION** — create `image_generation_jobs` table with RLS

---

## Notes on `proxy-openai-generate-image`

The existing function (`proxy-openai-generate-image`) is kept as-is and not deleted — it is still used for the "carousel image generation" flow in CreatePost.tsx which calls an n8n webhook differently. Only the main AI modal image generation path (via the primary n8n webhook) is switched to async.
