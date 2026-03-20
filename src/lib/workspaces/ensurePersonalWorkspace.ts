import { supabase } from "@/integrations/supabase/client";

/**
 * MVP behavior: the "active workspace" defaults to the user's personal workspace.
 * We model it as `workspaces.id = auth.uid()`, and ensure membership exists.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<void> {
  // Create/update the workspace
  const { error: workspaceError } = await supabase
    .from("workspaces")
    .upsert(
      { id: userId, name: "Personal Workspace" },
      { onConflict: "id" }
    );

  if (workspaceError) throw workspaceError;

  // Create/update membership (role=ADMIN => OWNER for now)
  const { error: memberError } = await supabase
    .from("workspace_members")
    .upsert(
      { workspace_id: userId, user_id: userId, role: "ADMIN" },
      { onConflict: "workspace_id,user_id" }
    );

  if (memberError) throw memberError;
}

