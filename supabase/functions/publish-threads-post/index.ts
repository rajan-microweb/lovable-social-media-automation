import { corsHeaders, errorResponse, jsonResponse } from "../_shared/encryption.ts";
import { requireAuthedUser } from "../_shared/oauth.ts";

/**
 * Threads publishing depends on Meta Threads API availability/permissions.
 * Stub implementation for now.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireAuthedUser(req);
    return jsonResponse(errorResponse("Threads publishing not implemented yet"), 501);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(errorResponse(message), message === "Unauthorized" ? 401 : 500);
  }
});

