import { serve } from 'std/server'
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
  // Parse platform from query params or request body
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') || (await req.json().catch(() => ({}))).platform

  if (!platform) {
    return new Response(JSON.stringify({ error: 'Missing platform parameter' }), { status: 400 })
  }

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  // Query platform_integrations table by platform
  const { data, error } = await supabase
    .from('platform_integrations')
    .select('*')
    .eq('platform', platform)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ data }), { status: 200 })
})
