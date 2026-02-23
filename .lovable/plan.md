

# Plan: Async Video Generation with Polling

## Problem
The `proxy-openai-generate-video` edge function polls OpenAI for up to 5 minutes (20 attempts x 15s), but edge functions have a 60-second timeout. This causes a 504 timeout error every time video generation is attempted.

## Solution
Split the video workflow into two phases: **start job** (returns immediately) and **check status** (called repeatedly by the frontend). The ChatGPT advice is correct -- we need an async job system.

## Architecture

```text
Frontend (AiPromptModal)
  |
  |-- POST /ai-content-generator (videoPrompt)
  |       |
  |       n8n --> proxy-openai-start-video (returns jobId in ~2s)
  |       n8n --> responds { jobId, status: "processing" }
  |
  |-- Poll every 10s: POST /ai-content-generator or direct edge fn
  |       |
  |       proxy-openai-check-video (jobId) --> checks OpenAI status
  |       If completed --> downloads binary, uploads to storage, returns videoUrl
  |       If processing --> returns { status: "processing" }
  |
  |-- When videoUrl received --> onGenerate(videoUrl)
```

## Changes Required

### 1. New Edge Function: `proxy-openai-start-video`
**File:** `supabase/functions/proxy-openai-start-video/index.ts`

- Accepts `{ user_id, videoPrompt }`
- Decrypts OpenAI key, calls `POST /v1/videos` to start job
- Returns `{ jobId, status: "processing" }` immediately (no polling)
- Responds in under 5 seconds -- no timeout risk

### 2. New Edge Function: `proxy-openai-check-video`
**File:** `supabase/functions/proxy-openai-check-video/index.ts`

- Accepts `{ user_id, jobId }`
- Decrypts OpenAI key, calls `GET /v1/videos/{jobId}` to check status
- If `completed`: fetches `/content`, handles binary upload to storage, returns `{ status: "completed", videoUrl }`
- If `processing`/`pending`: returns `{ status: "processing" }`
- If `failed`: returns `{ status: "failed", error }` 
- Each call takes only a few seconds -- no timeout risk

### 3. Remove Old Function: `proxy-openai-generate-video`
Delete `supabase/functions/proxy-openai-generate-video/index.ts` and its config entry since it will be fully replaced by the two new functions.

### 4. Update `supabase/config.toml`
- Remove `[functions.proxy-openai-generate-video]`
- Add `[functions.proxy-openai-start-video]` with `verify_jwt = false`
- Add `[functions.proxy-openai-check-video]` with `verify_jwt = false`

### 5. Update Frontend: `AiPromptModal.tsx`
Modify the video generation branch to use a two-phase approach:

**Phase 1 -- Start:** Call n8n webhook with `videoPrompt`, receive `{ jobId, status: "processing" }`

**Phase 2 -- Poll:** Every 10 seconds, call a second n8n webhook (or directly call the check edge function) with the `jobId`. Show progress like "Generating video... (30s elapsed)". When `status === "completed"`, use the returned `videoUrl`.

The modal stays open with a progress indicator during polling. Max polling duration: 5 minutes with a timeout message.

### 6. n8n Workflow Changes (Manual)
You will need to update your n8n workflow:

- **VIDEO branch**: Change the HTTP Request node to call `proxy-openai-start-video` instead of `proxy-openai-generate-video`. Update "Respond to Webhook" to return `{ jobId, status }` instead of `{ videoUrl }`.
- **New workflow**: Create a second webhook at `/check-video-status` that calls `proxy-openai-check-video` with the `jobId` and returns the result.

---

## Technical Details

### `proxy-openai-start-video/index.ts`
```typescript
// Validates API key, decrypts OpenAI key
// POST https://api.openai.com/v1/videos { model: "sora-2", prompt, size: "720x1280" }
// Returns: { success: true, data: { jobId: response.id, status: "processing" } }
```

### `proxy-openai-check-video/index.ts`
```typescript
// Validates API key, decrypts OpenAI key
// GET https://api.openai.com/v1/videos/{jobId}
// If completed:
//   GET /v1/videos/{jobId}/content (redirect: "manual")
//   Handle redirect URL / JSON URL / raw binary upload to storage
//   Returns: { success: true, data: { status: "completed", videoUrl } }
// If processing:
//   Returns: { success: true, data: { status: "processing" } }
// If failed:
//   Returns: { success: true, data: { status: "failed" } }
```

### Frontend Polling Logic (AiPromptModal.tsx)
```typescript
// Video branch:
// 1. POST to n8n webhook -> get { jobId, status }
// 2. setInterval every 10s -> call check-video-status webhook
// 3. Show elapsed time in progress text
// 4. On "completed" -> clearInterval, use videoUrl
// 5. On "failed" or timeout (5 min) -> clearInterval, show error
```

### Files Created
- `supabase/functions/proxy-openai-start-video/index.ts`
- `supabase/functions/proxy-openai-check-video/index.ts`

### Files Modified
- `src/components/AiPromptModal.tsx` (async polling for video)
- `supabase/config.toml` (add new functions, remove old)

### Files Deleted
- `supabase/functions/proxy-openai-generate-video/index.ts`

