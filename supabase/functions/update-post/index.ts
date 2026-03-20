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

// Whitelist schema for allowed update fields
const updatePostSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  text: z.string().max(10000).nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'pending_approval', 'published', 'failed']).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  type_of_post: z.string().max(100).nullable().optional(),
  platforms: z.array(z.string().max(50)).nullable().optional(),
  account_type: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(100)).nullable().optional(),
  image: z.string().max(2000).nullable().optional(),
  video: z.string().max(2000).nullable().optional(),
  pdf: z.string().max(2000).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API Key authentication
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error('Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { post_id, user_id, workspace_id, ...rawUpdateData } = body;

    // Validate required fields
    if (!user_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'user_id and workspace_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uuidSchema = z.string().uuid();
    const userIdResult = uuidSchema.safeParse(user_id);
    if (!userIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const workspaceIdResult = uuidSchema.safeParse(workspace_id);
    if (!workspaceIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid workspace_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!post_id) {
      console.error('Missing post_id in request');
      return new Response(
        JSON.stringify({ error: 'post_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate post_id is a valid UUID
    const postIdResult = uuidSchema.safeParse(post_id);
    if (!postIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid post_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and whitelist update data
    const validationResult = updatePostSchema.safeParse(rawUpdateData);
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid update data', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updateData = validationResult.data;

    // Verify the caller is a member of the workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (membershipError) {
      console.error('Error checking workspace membership:', membershipError);
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

    // Verify the post belongs to the workspace
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('workspace_id')
      .eq('id', post_id)
      .single();

    if (fetchError || !post) {
      console.error('Post not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (post.workspace_id !== workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Wrong workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Updating post:', post_id, 'for user:', user_id, 'with validated data:', updateData);

    const { data, error } = await supabase
      .from('posts')
      .update(updateData)
      .eq('id', post_id)
      .eq('workspace_id', workspace_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating post:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Post updated successfully:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-post function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
