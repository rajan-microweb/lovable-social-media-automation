import { corsHeaders, errorResponse, jsonResponse } from "../_shared/encryption.ts";
import { requireAuthedUser } from "../_shared/oauth.ts";

/**
 * YouTube uploads require resumable upload (or multipart) to the YouTube Data API.
 * Stub implementation for now.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireAuthedUser(req);
    return jsonResponse(errorResponse("YouTube upload not implemented yet"), 501);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

