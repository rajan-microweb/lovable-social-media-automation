

# LinkedIn Automatic Token Refresh with Expiration Monitoring

## Overview

Implement automatic LinkedIn access token refresh using refresh tokens, with proactive renewal before expiration. The system will also display token expiration status in the UI and automatically disconnect integrations when refresh tokens expire.

---

## LinkedIn Token Lifecycle

| Token Type | Lifetime | Renewal Strategy |
|------------|----------|------------------|
| Access Token | 60 days | Auto-refresh **7 days before** expiration |
| Refresh Token | 365 days | Cannot be refreshed - auto-disconnect **7 days before** expiration |

---

## Implementation Components

### 1. New Edge Function: `proxy-linkedin-refresh-token`

Create a secure edge function following the existing YouTube refresh pattern:

**File:** `supabase/functions/proxy-linkedin-refresh-token/index.ts`

**Functionality:**
- Accept `user_id` from n8n (no credentials sent from caller)
- Fetch and decrypt stored LinkedIn credentials from database
- Extract `refresh_token`, `client_id`, and `client_secret`
- Call LinkedIn OAuth endpoint with `grant_type=refresh_token`
- Store new `access_token` with updated `expires_at` timestamp
- Preserve or update `refresh_token` if LinkedIn issues a new one
- Store `refresh_token_expires_at` for monitoring
- Return only success/failure status (no credentials exposed)

**LinkedIn Refresh API:**
```text
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token={stored_refresh_token}
client_id={from_metadata_or_env}
client_secret={from_metadata_or_env}
```

**Response Structure:**
```json
{
  "access_token": "new_access_token",
  "expires_in": 5184000,
  "refresh_token": "same_or_new_refresh_token",
  "refresh_token_expires_in": 31536000
}
```

---

### 2. New Edge Function: `check-expiring-tokens`

Create an orchestrator function to identify tokens needing attention:

**File:** `supabase/functions/check-expiring-tokens/index.ts`

**Functionality:**
- Query all LinkedIn integrations from `platform_integrations`
- Identify tokens that need attention based on stored `expires_at` and `refresh_token_expires_at`
- Return list of integrations requiring action with their status

**Return Format:**
```json
{
  "needs_access_refresh": [
    { "user_id": "...", "platform": "linkedin", "expires_in_days": 5 }
  ],
  "needs_disconnect_warning": [
    { "user_id": "...", "platform": "linkedin", "refresh_expires_in_days": 6 }
  ],
  "should_auto_disconnect": [
    { "user_id": "...", "platform": "linkedin", "reason": "refresh_token_expired" }
  ]
}
```

---

### 3. Configuration Update

**File:** `supabase/config.toml`

Add new function configurations:
```toml
[functions.proxy-linkedin-refresh-token]
verify_jwt = false

[functions.check-expiring-tokens]
verify_jwt = false
```

---

### 4. Credential Storage Enhancement

When storing LinkedIn credentials initially (in n8n or store-platform-integration), include expiration timestamps:

**Credentials JSON Structure:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2025-04-09T12:00:00.000Z",
  "refresh_token_expires_at": "2026-02-08T12:00:00.000Z"
}
```

The `expires_at` is calculated as: `current_time + expires_in` seconds
The `refresh_token_expires_at` is calculated as: `current_time + refresh_token_expires_in` seconds

---

### 5. UI Enhancements for Token Expiration Display

**File:** `src/pages/Accounts.tsx`

**New Features:**

1. **Token Status Badge on Account Cards:**
   - Green badge: "Token OK" (more than 14 days remaining)
   - Yellow badge: "Expires in X days" (7-14 days remaining)
   - Orange badge: "Expires soon" (less than 7 days)
   - Red badge: "Reconnect required" (expired or refresh token expiring)

2. **Refresh Token Countdown:**
   - Display "Reconnection required in X months/days" when refresh token is approaching expiration
   - Show warning alert when less than 30 days remaining

3. **Automatic Disconnect Handling:**
   - When refresh token has expired or is about to expire (within 7 days), mark the integration for disconnection
   - Show a prominent alert explaining the user must reconnect

**Visual Implementation:**
```text
+----------------------------------+
| LinkedIn Account Card            |
|                                  |
| [Avatar] John Doe                |
| Personal                         |
|                                  |
| Token: Expires in 52 days        |
| Reconnect in: 11 months          |
|                                  |
| [Connected indicator]            |
+----------------------------------+
```

**When refresh token expires soon:**
```text
+----------------------------------+
| LinkedIn Account Card            |
|                                  |
| [Avatar] John Doe                |
| Personal                         |
|                                  |
| [!] Reconnect in 5 days          |
|                                  |
| [Reconnect Now Button]           |
+----------------------------------+
```

---

### 6. Auto-Disconnect Logic

**When Refresh Token Expires (or is within 7 days of expiring):**

1. The `check-expiring-tokens` function identifies the integration
2. n8n workflow (or a scheduled check) calls the function
3. For integrations with expired refresh tokens:
   - Update status to `expired` in database
   - UI will show "Expired - Please Reconnect" badge
   - Alternatively, delete the integration entirely (configurable)

**Implementation Options:**
- **Soft disconnect:** Set `status = 'expired'` - keeps data but prevents posting
- **Hard disconnect:** Delete the integration record - requires full re-auth

---

## n8n Workflow Integration

After deployment, configure an n8n workflow to:

1. **Daily Schedule (e.g., 3 AM):**
   - Call `check-expiring-tokens` to get list of tokens needing attention
   - For each token needing access refresh: call `proxy-linkedin-refresh-token`
   - For each token needing disconnect: update integration status or delete

2. **Logic Flow:**
   ```text
   Schedule Trigger (Daily)
       ↓
   Call check-expiring-tokens
       ↓
   ┌─────────────────────────────────┐
   │ For each "needs_access_refresh" │
   │ → Call proxy-linkedin-refresh   │
   └─────────────────────────────────┘
       ↓
   ┌─────────────────────────────────┐
   │ For each "should_auto_disconnect"│
   │ → Update status to 'expired'    │
   │   OR delete integration         │
   └─────────────────────────────────┘
   ```

---

## Timing Configuration

| Action | Trigger Point |
|--------|---------------|
| Access token refresh | 7 days before `expires_at` |
| Disconnect warning (UI) | 30 days before `refresh_token_expires_at` |
| Auto-disconnect | 7 days before `refresh_token_expires_at` |

These thresholds can be configured in the edge functions.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/proxy-linkedin-refresh-token/index.ts` | Create | Handle LinkedIn token refresh |
| `supabase/functions/check-expiring-tokens/index.ts` | Create | Identify expiring tokens |
| `supabase/config.toml` | Modify | Add function configurations |
| `src/pages/Accounts.tsx` | Modify | Display token expiration status and warnings |

---

## Security Guarantees

- All token operations happen server-side via edge functions
- Access tokens and refresh tokens never leave the backend
- Only success/failure status returned to callers
- Client credentials stored in integration metadata (multi-tenant support)
- Proactive refresh prevents token-related posting failures

