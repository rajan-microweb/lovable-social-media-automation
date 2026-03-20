import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by client IP
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json();
    const { file_path, file_url, workspace_id, user_id: bodyUserId } = body;

    const uuidSchema = z.string().uuid();
    const workspaceIdResult = uuidSchema.safeParse(workspace_id);
    if (!workspaceIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing workspace_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract file path from URL if provided
    let filePath = file_path;
    if (!filePath && file_url) {
      const urlParts = file_url.split('/post-media/');
      if (urlParts.length > 1) {
        filePath = urlParts[1];
      }
    }

    if (!filePath) {
      console.error('Missing file_path or file_url in request');
      return new Response(
        JSON.stringify({ error: 'file_path or file_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth: support both (a) external API key auth and (b) frontend JWT auth.
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');
    const authHeader = req.headers.get('Authorization');

    let targetUserId: string | null = null;
    const isApiKeyAuth = apiKey && apiKey === expectedApiKey;

    if (isApiKeyAuth) {
      // For API key auth, user_id must be provided in body.
      if (!bodyUserId) {
        return new Response(
          JSON.stringify({ error: 'user_id is required for API key auth' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const userIdResult = uuidSchema.safeParse(bodyUserId);
      if (!userIdResult.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid user_id format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetUserId = bodyUserId;
    } else if (authHeader?.startsWith('Bearer ')) {
      // JWT auth: validate token and delete as the signed-in user.
      const token = authHeader.replace('Bearer ', '');
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetUserId = user.id;
    } else {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure the file being deleted belongs to the authenticated user prefix.
    if (!filePath.startsWith(`${targetUserId}/`)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - file_path does not belong to user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify workspace membership before deleting.
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify workspace membership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Not a workspace member' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting file from bucket:', filePath, 'for user:', targetUserId);

    const { data, error } = await supabase
      .storage
      .from('post-media')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting file:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('File deleted successfully:', data);

    return new Response(
      JSON.stringify({ success: true, deleted_files: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-media function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
