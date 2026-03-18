import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./encryption.ts";

export type AuthedUser = { id: string };

function base64UrlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function getSupabaseAuthClient(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function getSupabaseServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function requireAuthedUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAuth = getSupabaseAuthClient(authHeader);
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return { id: user.id };
}

export function redirect(url: string, extraHeaders: Record<string, string> = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: url,
      ...extraHeaders,
    },
  });
}

export async function createOAuthState(params: {
  user_id: string;
  platform_name: string;
  redirect_to?: string | null;
  pkce_verifier?: string | null;
  ttlSeconds?: number;
}): Promise<{ state: string; state_hash: string; expires_at: string }> {
  const ttlSeconds = params.ttlSeconds ?? 10 * 60; // 10 minutes
  const state = crypto.randomUUID();
  const state_hash = await sha256Base64Url(state);
  const expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("oauth_states").insert({
    user_id: params.user_id,
    platform_name: params.platform_name,
    state_hash,
    pkce_verifier: params.pkce_verifier ?? null,
    redirect_to: params.redirect_to ?? null,
    expires_at,
  });

  if (error) {
    throw new Error(`Failed to create OAuth state: ${error.message}`);
  }

  return { state, state_hash, expires_at };
}

export async function consumeOAuthState(params: {
  platform_name: string;
  state: string;
}): Promise<{ user_id: string; pkce_verifier: string | null; redirect_to: string | null }> {
  const state_hash = await sha256Base64Url(params.state);
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("oauth_states")
    .select("id, user_id, pkce_verifier, redirect_to, expires_at")
    .eq("platform_name", params.platform_name)
    .eq("state_hash", state_hash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read OAuth state: ${error.message}`);
  }
  if (!data) {
    throw new Error("Invalid state");
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    // Best effort cleanup
    await supabase.from("oauth_states").delete().eq("id", data.id);
    throw new Error("State expired");
  }

  // Delete-on-use
  await supabase.from("oauth_states").delete().eq("id", data.id);

  return {
    user_id: data.user_id,
    pkce_verifier: data.pkce_verifier ?? null,
    redirect_to: data.redirect_to ?? null,
  };
}

export function generatePkceVerifier(): string {
  // 32 bytes -> 43 chars base64url (no padding)
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

export async function pkceChallengeS256(verifier: string): Promise<string> {
  return await sha256Base64Url(verifier);
}

