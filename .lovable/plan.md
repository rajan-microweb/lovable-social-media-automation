

# Plan: Create Proxy Edge Functions for OpenAI Content Generation

## Summary

Replace the current n8n workflow where the OpenAI API key is passed from the frontend. Instead, create 3 new proxy edge functions that accept only a `user_id` and prompt, fetch the OpenAI API key securely from the database, call the OpenAI API server-side, and return the result to n8n.

## Current Workflow (n8n)

The n8n workflow "AI Content Generator" receives a webhook POST and routes based on which prompt field is present:

1. **Text Generation** -- `textPrompt` exists --> calls `POST https://api.openai.com/v1/chat/completions` with `gpt-4o-mini` and a social media system prompt --> returns `{ text }`
2. **Image Generation** -- `imagePrompt` exists --> calls `POST https://api.openai.com/v1/images/generations` with `dall-e-3`, 1024x1024 --> returns `{ imageUrl }`
3. **Video Generation** -- `videoPrompt` exists --> calls `POST https://api.openai.com/v1/videos` with `sora-2`, 720x1280 --> waits 15s --> polls job status --> loops until completed --> returns `{ videoUrl }`

All three currently receive the API key via `$json.body.apiKey` from the request body.

## New Architecture

Create 3 proxy edge functions. n8n will call these instead of calling OpenAI directly. The API key never leaves the server.

```text
n8n Workflow
  |
  +--> proxy-openai-generate-text    (user_id, textPrompt, context)
  |       |-> decrypt OpenAI key from DB
  |       |-> call /v1/chat/completions
  |       \-> return { text }
  |
  +--> proxy-openai-generate-image   (user_id, imagePrompt)
  |       |-> decrypt OpenAI key from DB
  |       |-> call /v1/images/generations
  |       \-> return { imageUrl }
  |
  +--> proxy-openai-generate-video   (user_id, videoPrompt)
          |-> decrypt OpenAI key from DB
          |-> call /v1/videos (Sora)
          |-> poll job status with retry loop
          \-> return { videoUrl }
```

## Edge Functions to Create

### 1. `proxy-openai-generate-text`

**File:** `supabase/functions/proxy-openai-generate-text/index.ts`

- **Input (POST body):** `{ user_id, textPrompt, platforms?, typeOfPost?, title?, description? }`
- **Auth:** x-api-key header validated against `N8N_API_KEY`
- **Logic:**
  1. Validate input (user_id and textPrompt required)
  2. Use `getDecryptedPlatformCredentials(supabase, user_id, "openai")` to get the API key
  3. Call `POST https://api.openai.com/v1/chat/completions` with model `gpt-4o-mini` and the existing social media system prompt from the n8n workflow
  4. Return `{ success: true, data: { text: response.choices[0].message.content } }`
- **Config:** `verify_jwt = false`

### 2. `proxy-openai-generate-image`

**File:** `supabase/functions/proxy-openai-generate-image/index.ts`

- **Input (POST body):** `{ user_id, imagePrompt }`
- **Auth:** x-api-key header validated against `N8N_API_KEY`
- **Logic:**
  1. Validate input (user_id and imagePrompt required)
  2. Decrypt OpenAI key from DB
  3. Call `POST https://api.openai.com/v1/images/generations` with model `dall-e-3`, n=1, size `1024x1024`
  4. Return `{ success: true, data: { imageUrl: response.data[0].url } }`
- **Config:** `verify_jwt = false`

### 3. `proxy-openai-generate-video`

**File:** `supabase/functions/proxy-openai-generate-video/index.ts`

- **Input (POST body):** `{ user_id, videoPrompt }`
- **Auth:** x-api-key header validated against `N8N_API_KEY`
- **Logic:**
  1. Validate input (user_id and videoPrompt required)
  2. Decrypt OpenAI key from DB
  3. Call `POST https://api.openai.com/v1/videos` with model `sora-2`, size `720x1280` to start the job
  4. Poll `GET /v1/video/generations/jobs/{job_id}` every 15 seconds until status is `completed` (with a max timeout of ~5 minutes to prevent infinite loops)
  5. Return `{ success: true, data: { videoUrl: response.url } }`
- **Config:** `verify_jwt = false`

### 4. Config Updates

Add to `supabase/config.toml`:

```toml
[functions.proxy-openai-generate-text]
verify_jwt = false

[functions.proxy-openai-generate-image]
verify_jwt = false

[functions.proxy-openai-generate-video]
verify_jwt = false
```

## Shared Patterns

All three functions will:
- Import from `../_shared/encryption.ts` (corsHeaders, validateApiKey, createSupabaseClient, getDecryptedPlatformCredentials, jsonResponse, successResponse, errorResponse)
- Extract the OpenAI key as `credentials.api_key || credentials.apiKey`
- Use the standardized response format `{ success, data, error }`
- Include proper CORS handling and error logging

## n8n Workflow Changes (Manual)

After deploying, update the n8n workflow to:
- Replace the 3 direct OpenAI HTTP Request nodes with calls to these proxy edge functions
- Remove `apiKey` from the webhook body -- only pass `user_id` and the prompt
- Each n8n node just does a POST to the proxy URL with `x-api-key` header and `{ user_id, prompt }` body

