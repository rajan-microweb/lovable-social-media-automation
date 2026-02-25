
# Plan: Enhanced AI Generation Modal with Sub-Options

## Overview
Replace the single-prompt modal with a two-step, icon-based modal. Step 1 shows selectable generation sub-options (cards with icons). Step 2 shows the relevant input (prompt textarea, or an existing media URL field). The n8n webhook payload fields are extended to support new source types.

## N8N Workflow Compatibility

The current workflow Switch node detects fields:
- `textPrompt` → TEXT branch
- `imagePrompt` → IMAGE branch
- `videoPrompt` → VIDEO branch

New payload fields to add for new sub-options (the Switch will need new cases added manually, or we can merge into existing cases using additional fields):

| Sub-option | New field sent | Action needed in n8n |
|---|---|---|
| Generate Text from Image | `textFromImageUrl` | Add new Switch case |
| Generate Text from Video | `textFromVideoUrl` | Add new Switch case |
| Generate Image from Text | `imageFromText` | Add new Switch case |
| Generate Video from Text | `videoFromText` | Add new Switch case |

You will need to add 4 new Switch cases and corresponding HTTP nodes + Respond nodes in your n8n workflow after this frontend change.

## Changes to `AiPromptModal.tsx`

The component is completely redesigned with two internal "steps":

### Step 1 — Option Selection
A grid of cards with icon + label, filtered by `fieldType` prop:

**Text options:**
- 📝 Generate Text (icon: `FileText`) → shows prompt textarea
- 🖼️ Generate Text from Image (icon: `Image`) → shows image URL input
- 🎥 Generate Text from Video (icon: `Video`) → shows video URL input

**Image options:**
- 🎨 Generate Image (icon: `Wand2`) → shows prompt textarea
- 🔤 Generate Image from Text (icon: `Type`) → shows text textarea

**Video options:**
- 🎬 Generate Video (icon: `Film`) → shows prompt textarea
- 🔤 Generate Video from Text (icon: `Type`) → shows text textarea

### Step 2 — Input & Generate
Based on chosen sub-option, shows either:
- **Prompt textarea** (for "Generate X" options)
- **URL input field** (for "from Image/Video" options)
- **Text textarea** (for "from Text" options)

A back arrow lets users return to Step 1 to pick a different option.

## Payload Structure Changes

```typescript
// Sub-option → payload field mapping
const PAYLOAD_FIELD_MAP = {
  // Text
  "text:prompt":        { textPrompt: prompt },
  "text:fromImage":     { textFromImageUrl: inputValue },
  "text:fromVideo":     { textFromVideoUrl: inputValue },
  // Image
  "image:prompt":       { imagePrompt: prompt },
  "image:fromText":     { imageFromText: inputValue },
  // Video
  "video:prompt":       { videoPrompt: prompt },
  "video:fromText":     { videoFromText: inputValue },
}
```

## Response Handling

The modal already handles `data.text`, `data.imageUrl`, and `data.jobId`+polling for video. New sub-options will return the same response shapes:
- Text-from-image/video → `{ text: "..." }` (same handler)
- Image-from-text → `{ imageUrl: "..." }` (same handler)
- Video-from-text → `{ jobId, status }` → polling (same handler)

No change needed to existing response/polling logic.

## Design Details

- **Step 1**: 2-column icon card grid, each card has large icon, title, subtle description. Selected card gets a highlighted border (primary color ring). Hover animation (scale + shadow).
- **Step 2**: Input area slides in with a fade/slide animation. Back button (←) in top-left of dialog. Submit button is "Generate" with spinner when loading.
- Modal width: `sm:max-w-lg` (slightly wider for option grid)
- Step indicator shown as dots or "Step 1/2" text

## Files Modified

- **`src/components/AiPromptModal.tsx`** — Complete redesign with step-based UI, option cards, and new payload fields

## N8N Updates Required (Manual)

After this frontend change, you must add these nodes to your n8n workflow:

1. **4 new Switch cases** checking for:
   - `$json.body.textFromImageUrl`
   - `$json.body.textFromVideoUrl`
   - `$json.body.imageFromText`
   - `$json.body.videoFromText`

2. **4 new HTTP Request nodes** calling your Supabase proxies with the corresponding inputs

3. **4 new Respond to Webhook nodes** returning the same shapes (`{ text }`, `{ imageUrl }`, `{ jobId, status }`)

The existing TEXT/IMAGE/VIDEO branches remain completely unchanged.
