
## Plan: Standardize Proxy Edge Functions with Database-Driven Credential Pattern

### Current State Analysis

**Current SMA Project Implementation:**
- ✅ Uses AES-256-GCM encryption for storing credentials in `platform_integrations` table
- ✅ All 8 proxy functions already use `user_id` parameter to fetch credentials from database
- ✅ Credentials are decrypted internally using `safeDecryptCredentials` helper
- ✅ Proxy functions return only non-sensitive metadata (no tokens exposed)
- ✅ All functions validate `N8N_API_KEY` header for authentication
- ⚠️ **Issue**: Inconsistency with CHATBOT project's cleaner helper utilities structure

**CHATBOT Project Pattern (Reference):**
- Uses shared utility functions in a separate module
- Has centralized encryption/decryption helpers with clear function signatures
- Cleaner response formatting with standardized JSON structure
- Better error handling and logging

### Gap Analysis

The SMA project **already implements the secure pattern correctly** but lacks some of the polished utilities from the CHATBOT project:

1. **Missing shared utilities module** - CHATBOT has helper functions to reduce code duplication across proxy functions
2. **Response format inconsistency** - Some functions return wrapped objects, others return flat structures
3. **Error handling patterns** - Could be more consistent
4. **Decryption fallback logic** - Only `proxy-linkedin-fetch-orgs` has dual-format support (pgcrypto + AES-GCM)

### Implementation Plan

#### Phase 1: Enhance Shared Encryption Module

**File: `supabase/functions/_shared/encryption.ts`**

Add new helper functions to the existing encryption utilities:
- `getDecryptedPlatformCredentials()` - Fetch and decrypt credentials by platform_name + user_id
- `getPlatformIntegration()` - Fetch integration record with proper error handling
- Keep existing `encryptCredentials`, `decryptCredentials`, `safeDecryptCredentials` functions

This reduces code duplication and provides a single source of truth.

#### Phase 2: Add Dual-Format Decryption Support to All Proxy Functions

**Affected Functions:**
- `proxy-instagram-fetch-accounts/index.ts`
- `proxy-youtube-fetch-channel/index.ts`
- `proxy-facebook-fetch-pages/index.ts`
- `proxy-facebook-exchange-token/index.ts`
- `proxy-twitter-fetch-user/index.ts`
- `proxy-validate-openai/index.ts`

**Change:**
Update each function's credential fetching to:
1. Check if `credentials_encrypted === true` → try RPC-based pgcrypto decryption first
2. Otherwise → use AES-GCM decryption via `safeDecryptCredentials`
3. This ensures backward compatibility with legacy pgcrypto-encrypted data

Currently only `proxy-linkedin-fetch-orgs` has this dual support.

#### Phase 3: Standardize Response Format

**All proxy functions should follow:**
```json
{
  "success": true,
  "data": { /* actual results */ },
  "error": null
}
```

**For errors:**
```json
{
  "success": false,
  "data": null,
  "error": "error message"
}
```

Currently functions return responses inconsistently:
- Some return direct data: `{ pages: [...] }`
- Some return wrapped: `{ channels: [...] }`
- Standardizing improves n8n workflow consistency

#### Phase 4: Enhance Error Logging

Add structured logging for debugging:
- Log which integration was queried (but NOT the decrypted keys)
- Log API call details (endpoint, method, response status)
- Include request IDs for tracing

#### Phase 5: Add Integration Selection Helper

Since multiple platforms might be stored per user (e.g., Instagram + Facebook), add helper to:
- Prioritize correct platform selection
- Handle cases where user might have multiple accounts
- Return helpful error messages if integration not found

### Files to Modify

1. **`supabase/functions/_shared/encryption.ts`** - Add new helper functions
2. **`supabase/functions/proxy-facebook-fetch-pages/index.ts`** - Add dual-format decryption, standardize response
3. **`supabase/functions/proxy-instagram-fetch-accounts/index.ts`** - Add dual-format decryption, standardize response
4. **`supabase/functions/proxy-youtube-fetch-channel/index.ts`** - Add dual-format decryption, standardize response
5. **`supabase/functions/proxy-youtube-refresh-token/index.ts`** - Standardize response format
6. **`supabase/functions/proxy-facebook-exchange-token/index.ts`** - Add dual-format decryption, standardize response
7. **`supabase/functions/proxy-twitter-fetch-user/index.ts`** - Add dual-format decryption, standardize response
8. **`supabase/functions/proxy-validate-openai/index.ts`** - Add dual-format decryption, standardize response
9. **`supabase/functions/proxy-linkedin-fetch-orgs/index.ts`** - Already has dual-format, just standardize response

### Security Guarantees

✅ **Already in place:**
- API keys/tokens never transmitted from n8n to proxy functions
- Credentials fetched from database only
- AES-256-GCM encryption at rest
- API keys never exposed in response payloads
- API Key authentication via `N8N_API_KEY` header

✅ **Will improve:**
- Consistent error handling prevents accidental credential leakage
- Dual-format decryption handles migration path from legacy encryption
- Standardized response format prevents misconfigurations in n8n workflows

### Implementation Sequence

1. Update `_shared/encryption.ts` with new helper functions
2. Update all 8 proxy functions one by one to:
   - Use new helper functions
   - Add dual-format decryption support
   - Standardize response format
3. Deploy all updated functions
4. Test each proxy function in n8n workflow to verify:
   - Only `user_id` sent from n8n
   - Credentials properly decrypted
   - Only metadata returned (no tokens)
   - Error messages are helpful and don't leak data

### Benefits

1. **Code consistency** - All proxy functions follow identical pattern
2. **Maintainability** - Changes to encryption logic only in one place
3. **Backward compatibility** - Supports both pgcrypto and AES-GCM formats
4. **Security** - Consistent error handling prevents data leaks
5. **Debugging** - Structured logging makes troubleshooting easier
