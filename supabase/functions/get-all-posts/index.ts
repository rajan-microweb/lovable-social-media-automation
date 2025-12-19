import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error('Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('API key validated successfully');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Create service client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse query parameters
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const userId = url.searchParams.get('user_id');

    console.log('Fetching scheduled posts with params:', { limit, user_id: userId });

    // Build query - always filter by status=scheduled
    let query = supabase
      .from('posts')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    // Optionally filter by user_id
    if (userId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid user_id format - must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      query = query.eq('user_id', userId);
    }

    const { data: posts, error } = await query;

    if (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }

    console.log(`Successfully fetched ${posts?.length || 0} scheduled posts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: posts || [],
        count: posts?.length || 0,
        filters: {
          status: 'scheduled',
          user_id: userId || null,
          limit
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in get-all-posts function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
