import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let platform_name: string | null = null;
    let user_id: string | null = null;

    // Try to get parameters from URL query string first
    const url = new URL(req.url);
    platform_name = url.searchParams.get('platform_name');
    user_id = url.searchParams.get('user_id');

    // If not in query params, try to parse JSON body (for POST requests)
    if (!platform_name && !user_id && req.method === 'POST') {
      try {
        const body = await req.text();
        if (body && body.trim()) {
          const json = JSON.parse(body);
          platform_name = json.platform_name || null;
          user_id = json.user_id || null;
        }
      } catch (parseError) {
        console.warn('Could not parse request body as JSON:', parseError);
        // Continue with empty params - will return all active integrations
      }
    }

    console.info('Fetching platform integrations:', { platform_name, user_id });

    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('status', 'active');

    if (platform_name) {
      query = query.eq('platform_name', platform_name);
    }

    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.info(`Found ${data?.length || 0} platform integrations`);

    return new Response(
      JSON.stringify({ data }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
