import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { story_ids } = await req.json();

    // workspace_id = user_id for personal workspaces
    const workspace_id = user.id;

    if (!Array.isArray(story_ids) || story_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "story_ids must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (story_ids.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 stories can be deleted at once" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is a member of the workspace
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify workspace membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Not a workspace member" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch stories to verify workspace membership and get media URLs
    const { data: stories, error: fetchError } = await supabase
      .from("stories")
      .select("id, workspace_id, image, video")
      .in("id", story_ids);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify story ownership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unauthorized = stories?.filter((s) => s.workspace_id !== workspace_id) || [];
    if (unauthorized.length > 0 || stories?.length !== story_ids.length) {
      return new Response(
        JSON.stringify({ error: "You can only delete stories from the active workspace" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect media files to delete
    const mediaFiles: string[] = [];
    stories?.forEach((story) => {
      [story.image, story.video].forEach((url) => {
        if (url && url.includes("post-media")) {
          const match = url.match(/post-media\/(.+)/);
          if (match) mediaFiles.push(match[1]);
        }
      });
    });

    if (mediaFiles.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("post-media")
        .remove(mediaFiles);
      if (storageError) {
        console.error("Error deleting media files:", storageError);
      }
    }

    const { error: deleteError } = await supabase
      .from("stories")
      .delete()
      .in("id", story_ids)
      .eq("workspace_id", workspace_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete stories" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, deleted: story_ids.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
