import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

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
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

const updateStorySchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  text: z.string().max(10000).optional(),
  status: z.enum(['draft', 'scheduled', 'pending_approval', 'published', 'failed']).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  type_of_story: z.string().max(100).nullable().optional(),
  platforms: z.array(z.string().max(50)).nullable().optional(),
  account_type: z.string().max(2000).nullable().optional(),
  image: z.string().max(2000).nullable().optional(),
  video: z.string().max(2000).nullable().optional(),
  recurrence_frequency: z.enum(['none', 'weekly', 'monthly']).optional(),
  recurrence_until: z.string().datetime().nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  published_at: z.string().nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Check for API key auth first, then JWT
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');
    const authHeader = req.headers.get('Authorization');

    let userId: string | null = null;

    if (apiKey && apiKey === expectedApiKey) {
      console.log('Authenticated via API key');
    } else if (authHeader?.startsWith('Bearer ')) {
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
      userId = user.id;
    } else {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { story_id, workspace_id: _ignored, user_id: bodyUserId, ...rawUpdateData } = body;

    // For API key auth, user_id must be in body; for JWT, use authenticated user
    const targetUserId = userId || bodyUserId;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(targetUserId).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // workspace_id = user_id for personal workspaces
    const workspace_id = targetUserId;

    if (!story_id) {
      return new Response(
        JSON.stringify({ error: 'story_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!uuidSchema.safeParse(story_id).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid story_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validationResult = updateStorySchema.safeParse(rawUpdateData);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid update data', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updateData = validationResult.data;

    // Verify workspace membership
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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify story belongs to workspace
    const { data: story, error: fetchError } = await supabase
      .from('stories')
      .select('workspace_id')
      .eq('id', story_id)
      .single();

    if (fetchError || !story) {
      return new Response(
        JSON.stringify({ error: 'Story not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (story.workspace_id !== workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Wrong workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Updating story:', story_id, 'for user:', targetUserId, 'with data:', updateData);

    const { data, error } = await supabase
      .from('stories')
      .update(updateData)
      .eq('id', story_id)
      .eq('workspace_id', workspace_id)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
