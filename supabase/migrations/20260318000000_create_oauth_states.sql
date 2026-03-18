-- Create oauth_states table for OAuth state + PKCE storage
-- This table is intended to be accessed ONLY by server-side code (Edge Functions using service role).

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_name text NOT NULL,
  state_hash text NOT NULL,
  pkce_verifier text,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Basic indexes for lookup/cleanup
CREATE INDEX IF NOT EXISTS oauth_states_state_hash_idx ON public.oauth_states(state_hash);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states(expires_at);

-- Enable RLS and block direct client access
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Ensure anon/authenticated cannot access even if misconfigured later
REVOKE ALL ON TABLE public.oauth_states FROM anon, authenticated;

-- Service role should be able to manage this table
GRANT ALL ON TABLE public.oauth_states TO service_role;

