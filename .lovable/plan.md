# Plan: Add Vision AI Capabilities (Image-to-Text & Video-to-Text)

## Current State Analysis

The uploaded n8n workflow (`AI_Content_Generator_~_SMA_2.json`) already has a Switch node with 7 cases including `textFromImage` and `textFromVideo`, but those two branches are **unconnected** — they route to empty arrays `[]` in the connections map. The frontend (`AiPromptModal.tsx`) already sends `generationType: "textFromImage"` and `generationType: "textFromVideo"` in payloads, but there are no Supabase edge functions to handle them yet.

## What Needs to Be Built

### 1. Two New Supabase Edge Functions

`**proxy-openai-text-from-image**`— Image Analysis (Image → Text)

- Receives: `user_id`, `imageUrl`, `prompt` (optional)
- Fetches the user's OpenAI API key from encrypted credentials
- Calls OpenAI `gpt-4o` with vision capability (multimodal: image + text)
- Returns: `{ text: "generated caption..." }`

`**proxy-openai-text-from-video**`— Video Analysis (Video → Text)

- Receives: `user_id`, `videoUrl`, `prompt` (optional)
- Fetches the user's OpenAI API key from encrypted credentials
- Calls OpenAI `gpt-4o` with the video URL via the Responses API
- Returns: `{ text: "generated description..." }`

Both functions follow the exact same pattern as existing proxy functions (`proxy-openai-generate-text`, etc.) using `_shared/encryption.ts`.

### 2. n8n Workflow Updates (Manual — Instructions Provided)

The frontend already sends the correct payload. You only need to wire up the two empty Switch branches in n8n:

**Branch: "Text from IMAGE" (index 1)**

- Add HTTP Request node → `POST https://fcfdyivyjidzqjtanalq.supabase.co/functions/v1/proxy-openai-text-from-image`
- Body: `user_id = {{ $('Webhook').item.json.body.userId }}`, `imageUrl = {{ $json.body.mediaUrl }}`, `prompt = {{ $json.body.prompt }}`
- Connect to a new "Respond to Webhook" node that returns `{ "text": $json.data.text }`

**Branch: "Text from VIDEO" (index 2)**

- Add HTTP Request node → `POST https://fcfdyivyjidzqjtanalq.supabase.co/functions/v1/proxy-openai-text-from-video`
- Body: `user_id = {{ $('Webhook').item.json.body.userId }}`, `videoUrl = {{ $json.body.mediaUrl }}`, `prompt = {{ $json.body.prompt }}`
- Connect to a new "Respond to Webhook" node that returns `{ "text": $json.data.text }`

### 3. supabase/config.toml Update

Add entries for the two new functions:

```toml
[functions.proxy-openai-text-from-image]
verify_jwt = false

[functions.proxy-openai-text-from-video]
verify_jwt = false
```

## Technical Details

### proxy-openai-text-from-image (Image Analysis)

Uses OpenAI Chat Completions with `gpt-4o` (vision-capable):

```typescript
const messages = [
  {
    role: "user",
    content: [
      { type: "text", text: prompt || "Analyze this image and generate engaging social media content. Include a caption, description, and relevant hashtags." },
      { type: "image_url", image_url: { url: imageUrl } }
    ]
  }
];
// POST to https://api.openai.com/v1/chat/completions
// model: "gpt-4o"
```

Returns: `{ success: true, data: { text: "..." } }`

### proxy-openai-text-from-video (Video Analysis)

Uses OpenAI Responses API with `gpt-4o` vision for video:

```typescript
// POST to https://api.openai.com/v1/responses
// model: "gpt-4.1"
// input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_video", video_url: videoUrl }] }]
```

Returns: `{ success: true, data: { text: "..." } }`

## Files to Create/Modify


| File                                                       | Action                     |
| ---------------------------------------------------------- | -------------------------- |
| `supabase/functions/proxy-openai-text-from-image/index.ts` | Create                     |
| `supabase/functions/proxy-openai-text-from-video/index.ts` | Create                     |
| `supabase/config.toml`                                     | Add 2 new function entries |


## No Frontend Changes Required

The `AiPromptModal.tsx` already:

- Shows "Text from Image" and "Text from Video" options correctly filtered by post type
- Sends `generationType: "textFromImage"` / `"textFromVideo"` 
- Sends `mediaUrl` (the bucket-stored URL) 
- Sends optional `prompt`
- Handles `{ text: "..." }` response correctly

## n8n Manual Steps (After Deployment)

Once the edge functions are deployed, you need to add two new branches to the Switch node in your n8n workflow:

1. Open the "AI Content Generator ~ SMA" workflow
2. For Switch output index 1 ("Text from IMAGE"):
  - Add HTTP Request node calling `proxy-openai-text-from-image`with `user_id`, `imageUrl` (from `$json.body.mediaUrl`), `prompt` (from `$json.body.prompt`)
  - Add "Respond to Webhook" returning `{ "text": $json.data.text }`
3. For Switch output index 2 ("Text from VIDEO"):
  - Add HTTP Request node calling `proxy-openai-text-from-video`with `user_id`, `videoUrl` (from `$json.body.mediaUrl`), `prompt` (from `$json.body.prompt`)
  - Add "Respond to Webhook" returning `{ "text": $json.data.text }`
4. Use the same "Header Lovable SMA Account" credential for authentication on both HTTP nodes

The existing `imageFromText` (index 4) and `videoFromText` (index 6) Switch branches are also currently unconnected. These can be wired up similarly using `proxy-openai-generate-image` (passing `imagePrompt = $json.body.text`) and `proxy-openai-start-video` (passing `videoPrompt = $json.body.text`) respectively.