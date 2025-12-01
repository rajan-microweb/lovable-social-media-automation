import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const facebookAppId = Deno.env.get('FB_APP_ID')!;
    const facebookAppSecret = Deno.env.get('FB_APP_SECRET')!;

    if (!facebookAppId || !facebookAppSecret) {
      console.error('Missing Facebook app credentials');
      return new Response(
        JSON.stringify({ error: 'Facebook app credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { short_lived_token, user_id } = body;

    console.log('Facebook auth request received for user:', user_id);

    if (!short_lived_token || !user_id) {
      console.error('Missing required fields');
      return new Response(
        JSON.stringify({ error: 'short_lived_token and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Exchange short-lived token for long-lived token
    console.log('Exchanging short-lived token for long-lived token...');
    const tokenExchangeUrl = `${GRAPH_API_BASE}/oauth/access_token?` + new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: facebookAppId,
      client_secret: facebookAppSecret,
      fb_exchange_token: short_lived_token,
    });

    const tokenResponse = await fetch(tokenExchangeUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      return new Response(
        JSON.stringify({ error: tokenData.error.message || 'Token exchange failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const longLivedToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000; // Default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('Long-lived token obtained, expires at:', expiresAt);

    // Step 2: Fetch user profile
    console.log('Fetching user profile...');
    const profileUrl = `${GRAPH_API_BASE}/me?fields=id,name,picture.type(large).redirect(false)&access_token=${longLivedToken}`;
    const profileResponse = await fetch(profileUrl);
    const profileData = await profileResponse.json();

    if (profileData.error) {
      console.error('Profile fetch error:', profileData.error);
      return new Response(
        JSON.stringify({ error: profileData.error.message || 'Failed to fetch user profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User profile fetched:', profileData.name);

    // Step 3: Fetch managed pages/accounts
    console.log('Fetching managed pages...');
    const accountsUrl = `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,picture.type(large).redirect(false)&access_token=${longLivedToken}`;
    const accountsResponse = await fetch(accountsUrl);
    const accountsData = await accountsResponse.json();

    if (accountsData.error) {
      console.error('Accounts fetch error:', accountsData.error);
      return new Response(
        JSON.stringify({ error: accountsData.error.message || 'Failed to fetch managed pages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pages = accountsData.data || [];
    console.log(`Found ${pages.length} managed pages`);

    // Step 4: Build credentials JSONB structure (mimicking LinkedIn structure)
    const credentials = {
      access_token: longLivedToken,
      expires_at: expiresAt,
      personal_info: {
        name: profileData.name,
        avatar_url: profileData.picture?.data?.url || null,
        linkedin_id: profileData.id, // Using linkedin_id key for compatibility
        provider_id: profileData.id, // Also store as provider_id for clarity
      },
      company_info: pages.map((page: any) => ({
        company_id: page.id,
        company_name: page.name,
        company_logo: page.picture?.data?.url || null,
        access_token: page.access_token,
      })),
    };

    console.log('Credentials structure built, upserting to database...');

    // Step 5: Upsert into platform_integrations
    const { data, error } = await supabase
      .from('platform_integrations')
      .upsert({
        user_id,
        platform_name: 'facebook',
        credentials,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,platform_name',
      })
      .select()
      .single();

    if (error) {
      console.error('Database upsert error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Facebook integration stored successfully for user:', user_id);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          platform_name: 'facebook',
          personal_name: profileData.name,
          pages_count: pages.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in facebook-auth function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
