
## Plan: Secure All 8 Proxy Edge Functions with Database-Driven Credentials

### Current Status
After reviewing the 8 proxy functions, I found that **4 functions already follow the secure pattern** (no credentials received from n8n):
- ✅ `proxy-validate-openai` - Receives only `user_id`, decrypts internally
- ✅ `proxy-linkedin-fetch-orgs` - Receives only `user_id`, decrypts internally
- ✅ `proxy-facebook-exchange-token` - Receives `user_id` + short_lived_token, stores encrypted, returns success only
- ✅ `proxy-twitter-fetch-user` - Receives only `user_id`, decrypts internally, uses OAuth 1.0a signing

**4 functions still need updates** to remove credentials from n8n payload:
- ❌ `proxy-facebook-fetch-pages` - Already correct pattern but needs verification
- ❌ `proxy-instagram-fetch-accounts` - Likely expects credentials from n8n
- ❌ `proxy-youtube-refresh-token` - Likely expects credentials from n8n
- ❌ `proxy-youtube-fetch-channel` - Likely expects credentials from n8n

### Implementation Strategy

<lov-mermaid>
graph TD
    A["n8n Webhook<br/>sends: user_id only"] --> B["Proxy Function<br/>receives: user_id"]
    B --> C["Query Database<br/>WHERE user_id = ? AND platform_name = ?"]
    C --> D["Decrypt Credentials<br/>using safeDecryptCredentials"]
    D --> E["Use Credentials Internally<br/>to Call Platform API"]
    E --> F["Sanitize Response<br/>Return only metadata/results"]
    F --> G["Send to n8n<br/>NO credentials exposed"]
</lov-mermaid>

### Function-by-Function Breakdown

#### 1. **proxy-instagram-fetch-accounts** ✏️ NEEDS UPDATE
- **Current**: Likely expects `access_token` in request body
- **Required Change**: Accept only `user_id`, fetch Instagram integration from DB, decrypt `access_token`, use internally
- **Internal Flow**: 
  - Query `platform_integrations` WHERE `platform_name = 'instagram'` AND `user_id = ?`
  - Decrypt credentials → extract `access_token`
  - Call Facebook Graph API → get pages → get IG Business accounts
  - Return only: `ig_business_id`, `ig_username`, `profile_picture_url`, `connected_page_id`, `connected_page_name`

#### 2. **proxy-youtube-fetch-channel** ✏️ NEEDS UPDATE
- **Current**: Likely expects `access_token` in request body
- **Required Change**: Accept only `user_id`, fetch YouTube integration from DB, decrypt, use internally
- **Internal Flow**:
  - Query `platform_integrations` WHERE `platform_name = 'youtube'` AND `user_id = ?`
  - Decrypt credentials → extract `access_token`
  - Call YouTube API `/channels?part=snippet,contentDetails,statistics&mine=true`
  - Return only: `channel_id`, `channel_name`, `description`, `thumbnail_url`, `subscriber_count`, `video_count`, `uploads_playlist_id`

#### 3. **proxy-youtube-refresh-token** ✏️ ALREADY CORRECT (but verify)
- **Current**: Already receives `user_id`, refreshes token internally, stores in DB
- **Verification**: Confirm it returns only `{ success: true, expires_in }` without any tokens

#### 4. **proxy-facebook-fetch-pages** ✏️ ALREADY CORRECT (minor cleanup)
- **Current**: Already receives `user_id`, decrypts, stores page tokens securely
- **Minor Fix**: Ensure `page_access_token` values are NOT returned to n8n (currently correct)

### Response Structure Standards
All functions must follow this pattern:
```json
{
  "success": true,
  "message": "Optional message",
  "data": {
    // Only non-sensitive metadata
    // NO api_key, access_token, refresh_token, secrets
  }
}
```

### Security Guarantees After Implementation
1. **No credentials transmitted**: All platform tokens/secrets fetched from database only
2. **No exposure via n8n**: Proxy functions encrypt before storing, return sanitized data
3. **Consistent pattern**: All 8 functions follow identical security model
4. **Internal decryption**: AES-256-GCM used via `safeDecryptCredentials`

### Implementation Sequence
1. Update `proxy-instagram-fetch-accounts` - restructure to fetch from DB
2. Update `proxy-youtube-fetch-channel` - restructure to fetch from DB  
3. Verify `proxy-youtube-refresh-token` - confirm token storage + no return
4. Verify `proxy-facebook-fetch-pages` - confirm page tokens stored + sanitized response
5. Deploy all 4 functions
6. Update n8n workflow nodes to send only `user_id` (no `access_token`)

### Files to Modify
- `supabase/functions/proxy-instagram-fetch-accounts/index.ts` - Restructure credential fetching
- `supabase/functions/proxy-youtube-fetch-channel/index.ts` - Add DB credential fetch
- `supabase/functions/proxy-youtube-refresh-token/index.ts` - Verify & simplify
- `supabase/functions/proxy-facebook-fetch-pages/index.ts` - Minor verification

### Testing Strategy
After deployment, each function must:
1. Receive only `{ user_id }` from n8n
2. Return sanitized data (no secrets)
3. Store sensitive data securely in DB before returning
4. Handle missing/invalid integrations gracefully
