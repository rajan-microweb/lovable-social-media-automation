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

    const { post_ids } = await req.json();

    // workspace_id = user_id for personal workspaces
    const workspace_id = user.id;

    if (!Array.isArray(post_ids) || post_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "post_ids must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (post_ids.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 posts can be deleted at once" }),
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

    // Fetch posts to verify they belong to the workspace
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, workspace_id, image, video, pdf")
      .in("id", post_ids);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify post ownership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0, message: "Posts already deleted or not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unauthorized = posts.filter((p) => p.workspace_id !== workspace_id);
    if (unauthorized.length > 0 || posts.length !== post_ids.length) {
      return new Response(
        JSON.stringify({ error: "You can only delete posts from the active workspace" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect media files to delete
    const mediaFiles: string[] = [];
    posts.forEach((post) => {
      [post.image, post.video, post.pdf].forEach((url) => {
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
      .from("posts")
      .delete()
      .in("id", post_ids)
      .eq("workspace_id", workspace_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, deleted: post_ids.length }),
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
