import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SSRF protection: block private/loopback/link-local hosts
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h.startsWith("169.254.")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require authenticated user via JWT
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authedUserId = userData.user.id;

    const { externalUrl, mediaType } = await req.json();

    if (!externalUrl) {
      return new Response(
        JSON.stringify({ error: "externalUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Downloading media for user ${authedUserId}`);

    let blob: Blob;
    let contentType: string;

    if (externalUrl.startsWith("data:")) {
      const matches = externalUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid base64 data URL format");
      }
      contentType = matches[1];
      const base64Data = matches[2];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: contentType });
    } else {
      // Validate URL scheme + host (SSRF protection)
      let parsed: URL;
      try { parsed = new URL(externalUrl); } catch {
        return new Response(
          JSON.stringify({ error: "Invalid URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (parsed.protocol !== "https:") {
        return new Response(
          JSON.stringify({ error: "Only https URLs are allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (isPrivateHost(parsed.hostname)) {
        return new Response(
          JSON.stringify({ error: "URL host not allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const response = await fetch(externalUrl, { redirect: "error" });
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      blob = await response.blob();
      contentType = blob.type || (mediaType === "image" ? "image/jpeg" : "video/mp4");
    }

    const extensionMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };
    const extension = extensionMap[contentType] || (mediaType === "image" ? "jpg" : "mp4");

    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const folder = mediaType === "image" ? "ai-images" : "ai-videos";
    // Always use authenticated user's ID for storage path
    const filePath = `${authedUserId}/${folder}/${randomId}-${timestamp}.${extension}`;

    console.log(`Uploading to storage: ${filePath}`);

    const arrayBuffer = await blob.arrayBuffer();

    const { data, error } = await supabase.storage
      .from("post-media")
      .upload(filePath, arrayBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      throw new Error(`Failed to upload to storage: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("post-media")
      .getPublicUrl(data.path);

    console.log(`Upload successful: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        path: data.path
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in upload-ai-media:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
